import assert from "node:assert/strict";
import test from "node:test";
import type {WorkerDatabase} from "./lib/database";
import {
  classifyEnvironmentProjectionHealth,
  filterEnvironmentsNeedingRepair,
  repairEnvironmentProjectionDrift,
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

test("repairs missing and stale environments while skipping fresh ones", async () => {
  const rebuildCalls: string[] = [];
  const generatedAt = new Date("2026-03-30T06:30:00.000Z");

  const result = await repairEnvironmentProjectionDrift(
    {} as WorkerDatabase,
    "redis://local",
    generatedAt,
    {
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
          projectionVersion: 1,
        };
      },
      rebuildProjection: async (_db, _redisUrl, environmentId, rebuildGeneratedAt) => {
        const effectiveGeneratedAt = rebuildGeneratedAt ?? generatedAt;
        rebuildCalls.push(`${environmentId}:${effectiveGeneratedAt.toISOString()}`);

        return {
          projection: {
            environmentId,
            flags: {},
            generatedAt: effectiveGeneratedAt.toISOString(),
            organizationId: "org_1",
            projectId: "proj_1",
            projectionVersion: environmentId === "env_b" ? 1 : 2,
          },
          redisKey: `ff:env_projection:${environmentId}`,
        };
      },
    },
  );

  assert.deepEqual(rebuildCalls, [
    "env_b:2026-03-30T06:30:00.000Z",
    "env_c:2026-03-30T06:30:00.000Z",
  ]);
  assert.deepEqual(result, {
    failedEnvironmentIds: [],
    repairedEnvironments: [
      {
        environmentId: "env_b",
        previousStatus: "missing",
        repairedProjectionVersion: 1,
      },
      {
        environmentId: "env_c",
        previousStatus: "stale",
        repairedProjectionVersion: 2,
      },
    ],
    skippedCount: 1,
  });
});

test("reports failed repairs when rebuilds throw or return null", async () => {
  const result = await repairEnvironmentProjectionDrift(
    {} as WorkerDatabase,
    "redis://local",
    new Date("2026-03-30T06:40:00.000Z"),
    {
      listEnvironmentProjectionVersions: async () => [
        {
          environmentId: "env_missing",
          postgresProjectionVersion: 1,
        },
        {
          environmentId: "env_stale",
          postgresProjectionVersion: 4,
        },
      ],
      readProjection: async (_redisUrl, environmentId) =>
        environmentId === "env_missing"
          ? null
          : {
              environmentId,
              flags: {},
              generatedAt: "2026-03-30T06:00:00.000Z",
              organizationId: "org_1",
              projectId: "proj_1",
              projectionVersion: 2,
            },
      rebuildProjection: async (_db, _redisUrl, environmentId) => {
        if (environmentId === "env_missing") {
          return null;
        }

        throw new Error("rebuild failed");
      },
    },
  );

  assert.deepEqual(result, {
    failedEnvironmentIds: ["env_missing", "env_stale"],
    repairedEnvironments: [],
    skippedCount: 0,
  });
});
