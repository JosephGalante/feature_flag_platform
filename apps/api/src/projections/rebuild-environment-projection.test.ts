import assert from "node:assert/strict";
import test from "node:test";
import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import {persistEnvironmentProjection} from "./rebuild-environment-projection";

const projection: CompiledEnvironmentProjection = {
  environmentId: "env_staging",
  flags: {},
  generatedAt: "2026-03-29T23:30:00.000Z",
  organizationId: "org_acme",
  projectId: "proj_checkout",
  projectionVersion: 7,
};

test("writes a compiled projection to Redis and returns its key", async () => {
  const calls: string[] = [];
  let writtenProjection: CompiledEnvironmentProjection | null = null;

  const result = await persistEnvironmentProjection(
    {
      buildProjection: async (environmentId, generatedAt) => {
        calls.push(`${environmentId}:${generatedAt.toISOString()}`);
        return projection;
      },
      writeProjection: async (nextProjection) => {
        writtenProjection = nextProjection;
      },
    },
    "env_staging",
    new Date("2026-03-29T23:30:00.000Z"),
  );

  assert.deepEqual(calls, ["env_staging:2026-03-29T23:30:00.000Z"]);
  assert.deepEqual(writtenProjection, projection);
  assert.deepEqual(result, {
    projection,
    redisKey: "ff:env_projection:env_staging",
  });
});

test("returns null without writing when the environment cannot be compiled", async () => {
  let writeCalled = false;

  const result = await persistEnvironmentProjection(
    {
      buildProjection: async () => null,
      writeProjection: async () => {
        writeCalled = true;
      },
    },
    "env_missing",
    new Date("2026-03-29T23:45:00.000Z"),
  );

  assert.equal(result, null);
  assert.equal(writeCalled, false);
});
