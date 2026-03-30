import assert from "node:assert/strict";
import test from "node:test";
import type {WorkerDatabase} from "./lib/database";
import {
  classifyEnvironmentProjectionHealth,
  filterEnvironmentsNeedingRepair,
  scanEnvironmentProjectionHealth,
} from "./reconciliation";

test("classifies a missing Redis projection as missing", () => {
  assert.equal(
    classifyEnvironmentProjectionHealth({
      postgresProjectionVersion: 4,
      redisProjectionVersion: null,
    }),
    "missing",
  );
});

test("classifies matching Postgres and Redis versions as fresh", () => {
  assert.equal(
    classifyEnvironmentProjectionHealth({
      postgresProjectionVersion: 4,
      redisProjectionVersion: 4,
    }),
    "fresh",
  );
});

test("classifies mismatched Postgres and Redis versions as stale", () => {
  assert.equal(
    classifyEnvironmentProjectionHealth({
      postgresProjectionVersion: 4,
      redisProjectionVersion: 2,
    }),
    "stale",
  );
  assert.equal(
    classifyEnvironmentProjectionHealth({
      postgresProjectionVersion: 2,
      redisProjectionVersion: 4,
    }),
    "stale",
  );
});

test("scans environments and reports fresh missing and stale projection health", async () => {
  const readCalls: string[] = [];

  const results = await scanEnvironmentProjectionHealth({} as WorkerDatabase, "redis://local", {
    listEnvironmentProjectionVersions: async () => [
      {
        environmentId: "env_a",
        postgresProjectionVersion: 3,
      },
      {
        environmentId: "env_b",
        postgresProjectionVersion: 1,
      },
      {
        environmentId: "env_c",
        postgresProjectionVersion: 2,
      },
    ],
    readProjection: async (_redisUrl, environmentId) => {
      readCalls.push(environmentId);

      if (environmentId === "env_a") {
        return {
          environmentId,
          flags: {},
          generatedAt: "2026-03-30T06:00:00.000Z",
          organizationId: "org_1",
          projectId: "proj_1",
          projectionVersion: 3,
        };
      }

      if (environmentId === "env_b") {
        return null;
      }

      return {
        environmentId,
        flags: {},
        generatedAt: "2026-03-30T06:00:00.000Z",
        organizationId: "org_1",
        projectId: "proj_1",
        projectionVersion: 5,
      };
    },
  });

  assert.deepEqual(readCalls, ["env_a", "env_b", "env_c"]);
  assert.deepEqual(results, [
    {
      environmentId: "env_a",
      postgresProjectionVersion: 3,
      redisProjectionVersion: 3,
      status: "fresh",
    },
    {
      environmentId: "env_b",
      postgresProjectionVersion: 1,
      redisProjectionVersion: null,
      status: "missing",
    },
    {
      environmentId: "env_c",
      postgresProjectionVersion: 2,
      redisProjectionVersion: 5,
      status: "stale",
    },
  ]);
});

test("filters reconciliation results down to environments needing repair", () => {
  assert.deepEqual(
    filterEnvironmentsNeedingRepair([
      {
        environmentId: "env_a",
        postgresProjectionVersion: 3,
        redisProjectionVersion: 3,
        status: "fresh",
      },
      {
        environmentId: "env_b",
        postgresProjectionVersion: 1,
        redisProjectionVersion: null,
        status: "missing",
      },
      {
        environmentId: "env_c",
        postgresProjectionVersion: 2,
        redisProjectionVersion: 5,
        status: "stale",
      },
    ]),
    [
      {
        environmentId: "env_b",
        postgresProjectionVersion: 1,
        redisProjectionVersion: null,
        status: "missing",
      },
      {
        environmentId: "env_c",
        postgresProjectionVersion: 2,
        redisProjectionVersion: 5,
        status: "stale",
      },
    ],
  );
});
