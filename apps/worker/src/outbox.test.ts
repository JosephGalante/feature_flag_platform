import assert from "node:assert/strict";
import test from "node:test";
import type {WorkerDatabase} from "./lib/database";
import {
  computeRetryDelayMs,
  processNextProjectionRefreshEvent,
  processProjectionRefreshBatch,
  readProjectionRefreshPayload,
} from "./outbox";

type FakeClaimedEventRow = {
  attemptCount: number;
  id: string;
  payloadJson: unknown;
};

type RecordedUpdate = {
  attemptCount: number;
  availableAt: Date;
  lastError: string | null;
  publishedAt: Date | null;
  status: string;
};

function createFakeWorkerDatabase(rows: FakeClaimedEventRow[]): {
  db: WorkerDatabase;
  updates: RecordedUpdate[];
} {
  const updates: RecordedUpdate[] = [];

  const createUpdateBuilder = () => ({
    set(values: RecordedUpdate) {
      return {
        where: async () => {
          updates.push(values);
        },
      };
    },
  });

  const trx = {
    execute: async () => ({
      rows: rows.length > 0 ? [rows.shift() as FakeClaimedEventRow] : [],
    }),
    update: () => createUpdateBuilder(),
  };

  const db = {
    transaction: async <T>(callback: (transaction: typeof trx) => Promise<T>) =>
      await callback(trx),
    update: () => createUpdateBuilder(),
  } as unknown as WorkerDatabase;

  return {
    db,
    updates,
  };
}

test("reads the environment id from a valid projection refresh payload", () => {
  assert.deepEqual(
    readProjectionRefreshPayload({
      environmentId: "env_staging",
      featureFlagId: "flag_checkout",
      organizationId: "org_acme",
      projectId: "proj_checkout",
      reason: "flag.updated",
      triggeredByUserId: "user_1",
    }),
    {
      environmentId: "env_staging",
      featureFlagId: "flag_checkout",
      organizationId: "org_acme",
      projectId: "proj_checkout",
      reason: "flag.updated",
      triggeredByUserId: "user_1",
    },
  );
});

test("rejects invalid projection refresh payloads", () => {
  assert.equal(readProjectionRefreshPayload(null), null);
  assert.equal(readProjectionRefreshPayload([]), null);
  assert.equal(readProjectionRefreshPayload({environmentId: 123}), null);
  assert.equal(readProjectionRefreshPayload({reason: "missing env"}), null);
});

test("computes exponential retry delays with a cap", () => {
  assert.equal(computeRetryDelayMs(1), 1_000);
  assert.equal(computeRetryDelayMs(2), 2_000);
  assert.equal(computeRetryDelayMs(3), 4_000);
  assert.equal(computeRetryDelayMs(10), 60_000);
});

test("publishes a claimed event after a successful projection rebuild", async () => {
  const now = new Date("2026-03-30T05:00:00.000Z");
  const {db, updates} = createFakeWorkerDatabase([
    {
      attemptCount: 0,
      id: "event_1",
      payloadJson: {environmentId: "env_staging"},
    },
  ]);
  const rebuildCalls: string[] = [];

  const outcome = await processNextProjectionRefreshEvent(db, "redis://local", now, {
    rebuildProjection: async (_db, _redisUrl, environmentId, generatedAt) => {
      const effectiveGeneratedAt = generatedAt ?? now;
      rebuildCalls.push(`${environmentId}:${effectiveGeneratedAt.toISOString()}`);

      return {
        projection: {
          environmentId,
          flags: {},
          generatedAt: effectiveGeneratedAt.toISOString(),
          organizationId: "org_1",
          projectId: "proj_1",
          projectionVersion: 1,
        },
        redisKey: `ff:env_projection:${environmentId}`,
      };
    },
  });

  assert.deepEqual(outcome, {
    eventId: "event_1",
    status: "published",
  });
  assert.deepEqual(rebuildCalls, ["env_staging:2026-03-30T05:00:00.000Z"]);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    attemptCount: 1,
    availableAt: now,
    lastError: null,
    publishedAt: now,
    status: "published",
  });
});

test("retries an event when the payload is invalid", async () => {
  const now = new Date("2026-03-30T05:10:00.000Z");
  const {db, updates} = createFakeWorkerDatabase([
    {
      attemptCount: 0,
      id: "event_2",
      payloadJson: {reason: "missing environment"},
    },
  ]);

  const outcome = await processNextProjectionRefreshEvent(db, "redis://local", now);

  assert.deepEqual(outcome, {
    eventId: "event_2",
    status: "retried",
  });
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.attemptCount, 1);
  assert.equal(updates[0]?.status, "pending");
  assert.equal(updates[0]?.publishedAt, null);
  assert.equal(updates[0]?.lastError, "Invalid projection refresh payload.");
  assert.equal(updates[0]?.availableAt.toISOString(), "2026-03-30T05:10:01.000Z");
});

test("fails an event after the final retry when projection rebuild keeps failing", async () => {
  const now = new Date("2026-03-30T05:20:00.000Z");
  const {db, updates} = createFakeWorkerDatabase([
    {
      attemptCount: 4,
      id: "event_3",
      payloadJson: {environmentId: "env_prod"},
    },
  ]);

  const outcome = await processNextProjectionRefreshEvent(db, "redis://local", now, {
    rebuildProjection: async () => {
      throw new Error("Redis unavailable");
    },
  });

  assert.deepEqual(outcome, {
    eventId: "event_3",
    status: "failed",
  });
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    attemptCount: 5,
    availableAt: now,
    lastError: "Redis unavailable",
    publishedAt: null,
    status: "failed",
  });
});

test("aggregates published retried and failed outcomes across a batch", async () => {
  const now = new Date("2026-03-30T05:30:00.000Z");
  const {db, updates} = createFakeWorkerDatabase([
    {
      attemptCount: 0,
      id: "event_4",
      payloadJson: {environmentId: "env_a"},
    },
    {
      attemptCount: 0,
      id: "event_5",
      payloadJson: {reason: "missing environment"},
    },
    {
      attemptCount: 4,
      id: "event_6",
      payloadJson: {environmentId: "env_b"},
    },
  ]);
  const rebuiltEnvironmentIds: string[] = [];

  const result = await processProjectionRefreshBatch(db, "redis://local", () => now, 10, {
    rebuildProjection: async (_db, _redisUrl, environmentId, generatedAt) => {
      const effectiveGeneratedAt = generatedAt ?? now;
      rebuiltEnvironmentIds.push(environmentId);

      if (environmentId === "env_b") {
        throw new Error("Projection write failed");
      }

      return {
        projection: {
          environmentId,
          flags: {},
          generatedAt: effectiveGeneratedAt.toISOString(),
          organizationId: "org_1",
          projectId: "proj_1",
          projectionVersion: 1,
        },
        redisKey: `ff:env_projection:${environmentId}`,
      };
    },
  });

  assert.deepEqual(result, {
    failedCount: 1,
    publishedCount: 1,
    retriedCount: 1,
  });
  assert.deepEqual(rebuiltEnvironmentIds, ["env_a", "env_b"]);
  assert.deepEqual(
    updates.map((update) => update.status),
    ["published", "pending", "failed"],
  );
});
