import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import {sendRedisCommand} from "./redis";

export function buildEnvironmentProjectionRedisKey(environmentId: string): string {
  return `ff:env_projection:${environmentId}`;
}

export function serializeEnvironmentProjection(projection: CompiledEnvironmentProjection): string {
  return JSON.stringify(projection);
}

export function parseEnvironmentProjection(payload: string): CompiledEnvironmentProjection {
  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error(
      `Invalid environment projection payload: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
}

export async function writeEnvironmentProjection(
  redisUrl: string,
  projection: CompiledEnvironmentProjection,
  timeoutMs = 1000,
): Promise<void> {
  const reply = await sendRedisCommand(
    redisUrl,
    [
      "SET",
      buildEnvironmentProjectionRedisKey(projection.environmentId),
      serializeEnvironmentProjection(projection),
    ],
    timeoutMs,
  );

  if (reply.kind === "simple_string" && reply.value === "OK") {
    return;
  }

  throw new Error(`Unexpected Redis response while writing projection: ${JSON.stringify(reply)}`);
}

export async function readEnvironmentProjection(
  redisUrl: string,
  environmentId: string,
  timeoutMs = 1000,
): Promise<CompiledEnvironmentProjection | null> {
  const reply = await sendRedisCommand(
    redisUrl,
    ["GET", buildEnvironmentProjectionRedisKey(environmentId)],
    timeoutMs,
  );

  if (reply.kind === "null_bulk_string") {
    return null;
  }

  if (reply.kind !== "bulk_string") {
    throw new Error(`Unexpected Redis response while loading projection: ${JSON.stringify(reply)}`);
  }

  return parseEnvironmentProjection(reply.value);
}
