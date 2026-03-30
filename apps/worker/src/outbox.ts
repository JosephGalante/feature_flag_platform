import {outboxEvents} from "@shared/database";
import {eq, sql} from "drizzle-orm";
import {rebuildEnvironmentProjection} from "../../api/src/projections/rebuild-environment-projection";
import type {WorkerDatabase} from "./lib/database";

const PROJECTION_REFRESH_EVENT_TYPE = "flag_projection_refresh_requested";
const MAX_ATTEMPTS = 5;
const MAX_BATCH_SIZE = 10;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 60_000;

type ClaimedProjectionRefreshEvent = {
  attemptCount: number;
  id: string;
  payloadJson: unknown;
};

type ProjectionRefreshPayload = {
  environmentId: string;
  featureFlagId?: string;
  organizationId?: string;
  projectId?: string;
  reason?: string;
  triggeredByUserId?: string;
};

type ProcessProjectionRefreshOutcome =
  | {eventId: string; status: "failed"}
  | {status: "idle"}
  | {eventId: string; status: "published"}
  | {eventId: string; status: "retried"};

type ProcessProjectionRefreshBatchResult = {
  failedCount: number;
  publishedCount: number;
  retriedCount: number;
};

type ProjectionRefreshDependencies = {
  rebuildProjection: typeof rebuildEnvironmentProjection;
};

const defaultDependencies: ProjectionRefreshDependencies = {
  rebuildProjection: rebuildEnvironmentProjection,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readProjectionRefreshPayload(
  payloadJson: unknown,
): ProjectionRefreshPayload | null {
  if (!isRecord(payloadJson)) {
    return null;
  }

  if (typeof payloadJson.environmentId !== "string" || payloadJson.environmentId.length === 0) {
    return null;
  }

  const payload: ProjectionRefreshPayload = {
    environmentId: payloadJson.environmentId,
  };

  if (typeof payloadJson.featureFlagId === "string") {
    payload.featureFlagId = payloadJson.featureFlagId;
  }

  if (typeof payloadJson.organizationId === "string") {
    payload.organizationId = payloadJson.organizationId;
  }

  if (typeof payloadJson.projectId === "string") {
    payload.projectId = payloadJson.projectId;
  }

  if (typeof payloadJson.reason === "string") {
    payload.reason = payloadJson.reason;
  }

  if (typeof payloadJson.triggeredByUserId === "string") {
    payload.triggeredByUserId = payloadJson.triggeredByUserId;
  }

  return payload;
}

function readClaimedProjectionRefreshEvent(value: unknown): ClaimedProjectionRefreshEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.id !== "string" || typeof value.attemptCount !== "number") {
    return null;
  }

  return {
    attemptCount: value.attemptCount,
    id: value.id,
    payloadJson: value.payloadJson,
  };
}

export function computeRetryDelayMs(nextAttemptCount: number): number {
  return Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** Math.max(nextAttemptCount - 1, 0));
}

async function markEventPublished(
  db: Pick<WorkerDatabase, "update">,
  eventId: string,
  attemptCount: number,
  now: Date,
): Promise<void> {
  await db
    .update(outboxEvents)
    .set({
      attemptCount,
      availableAt: now,
      lastError: null,
      publishedAt: now,
      status: "published",
    })
    .where(eq(outboxEvents.id, eventId));
}

async function markEventFailure(
  db: Pick<WorkerDatabase, "update">,
  eventId: string,
  nextAttemptCount: number,
  now: Date,
  errorMessage: string,
): Promise<"failed" | "retried"> {
  const nextStatus = nextAttemptCount >= MAX_ATTEMPTS ? "failed" : "pending";
  const nextAvailableAt =
    nextStatus === "failed" ? now : new Date(now.getTime() + computeRetryDelayMs(nextAttemptCount));

  await db
    .update(outboxEvents)
    .set({
      attemptCount: nextAttemptCount,
      availableAt: nextAvailableAt,
      lastError: errorMessage,
      publishedAt: null,
      status: nextStatus,
    })
    .where(eq(outboxEvents.id, eventId));

  return nextStatus === "failed" ? "failed" : "retried";
}

export async function processNextProjectionRefreshEvent(
  db: WorkerDatabase,
  redisUrl: string,
  now: Date = new Date(),
  dependencies: ProjectionRefreshDependencies = defaultDependencies,
): Promise<ProcessProjectionRefreshOutcome> {
  return await db.transaction(async (trx) => {
    const result = await trx.execute(sql<ClaimedProjectionRefreshEvent>`
      select
        id,
        attempt_count as "attemptCount",
        payload_json as "payloadJson"
      from outbox_events
      where status = 'pending'
        and event_type = ${PROJECTION_REFRESH_EVENT_TYPE}
        and available_at <= now()
      order by created_at asc
      limit 1
      for update skip locked
    `);

    const claimedEvent = readClaimedProjectionRefreshEvent(result.rows[0] ?? null);

    if (!claimedEvent) {
      return {status: "idle"};
    }

    const nextAttemptCount = claimedEvent.attemptCount + 1;
    const payload = readProjectionRefreshPayload(claimedEvent.payloadJson);

    if (!payload) {
      const status = await markEventFailure(
        trx,
        claimedEvent.id,
        nextAttemptCount,
        now,
        "Invalid projection refresh payload.",
      );

      return {
        eventId: claimedEvent.id,
        status,
      };
    }

    try {
      const rebuildResult = await dependencies.rebuildProjection(
        db,
        redisUrl,
        payload.environmentId,
        now,
      );

      if (!rebuildResult) {
        throw new Error(`Environment ${payload.environmentId} could not be rebuilt.`);
      }

      await markEventPublished(trx, claimedEvent.id, nextAttemptCount, now);

      return {
        eventId: claimedEvent.id,
        status: "published",
      };
    } catch (error) {
      const status = await markEventFailure(
        trx,
        claimedEvent.id,
        nextAttemptCount,
        now,
        error instanceof Error ? error.message : "Projection refresh failed.",
      );

      return {
        eventId: claimedEvent.id,
        status,
      };
    }
  });
}

export async function processProjectionRefreshBatch(
  db: WorkerDatabase,
  redisUrl: string,
  nowProvider: () => Date = () => new Date(),
  maxBatchSize = MAX_BATCH_SIZE,
  dependencies: ProjectionRefreshDependencies = defaultDependencies,
): Promise<ProcessProjectionRefreshBatchResult> {
  const result: ProcessProjectionRefreshBatchResult = {
    failedCount: 0,
    publishedCount: 0,
    retriedCount: 0,
  };

  for (let processedCount = 0; processedCount < maxBatchSize; processedCount += 1) {
    const outcome = await processNextProjectionRefreshEvent(
      db,
      redisUrl,
      nowProvider(),
      dependencies,
    );

    if (outcome.status === "idle") {
      break;
    }

    if (outcome.status === "published") {
      result.publishedCount += 1;
      continue;
    }

    if (outcome.status === "retried") {
      result.retriedCount += 1;
      continue;
    }

    result.failedCount += 1;
  }

  return result;
}
