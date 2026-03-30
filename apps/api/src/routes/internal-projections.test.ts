import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";
import {buildQStashProjectionRefreshUrl} from "../lib/qstash";
import {registerInternalProjectionRoutes} from "./internal-projections";

const qstashConfig: ApiConfig = {
  databaseUrl: "postgresql://postgres:postgres@localhost:5432/feature_flags",
  host: "127.0.0.1",
  isProduction: false,
  port: 4000,
  qstash: {
    currentSigningKey: "current-signing-key",
    nextSigningKey: "next-signing-key",
    publicApiBaseUrl: "https://feature-flag-platform-api.onrender.com",
    token: "qstash-token",
  },
  redisUrl: "rediss://default:token@primary-guppy-88874.upstash.io:6379",
  sessionCookieName: "ff_admin_session",
  sessionSecret: "replace-me",
};

const projectionRefreshBody = JSON.stringify({
  environmentId: "22222222-2222-4222-8222-222222222222",
  featureFlagId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  projectId: "55555555-5555-4555-8555-555555555555",
  reason: "flag.configuration.updated",
  requestId: "req_123",
  triggeredByUserId: "11111111-1111-4111-8111-111111111111",
});

async function buildTestApp(dependencies: Parameters<typeof registerInternalProjectionRoutes>[3]) {
  const app = Fastify();

  app.addContentTypeParser("application/qstash+json", {parseAs: "string"}, (_, body, done) => {
    done(null, body);
  });

  await registerInternalProjectionRoutes(app, {} as ApiDatabase, qstashConfig, dependencies);

  return app;
}

test("rejects QStash callbacks with an invalid signature", async () => {
  const app = await buildTestApp({
    rebuildProjection: async () => {
      throw new Error("rebuild should not run for invalid signatures");
    },
    verifyQStashRequest: async () => {
      throw new Error("invalid signature");
    },
  });

  try {
    const response = await app.inject({
      body: projectionRefreshBody,
      headers: {
        "content-type": "application/qstash+json",
        "upstash-signature": "invalid-signature",
      },
      method: "POST",
      url: "/internal/projections/rebuild-async",
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "INVALID_QSTASH_SIGNATURE",
      message: "The Upstash signature could not be verified.",
    });
  } finally {
    await app.close();
  }
});

test("rejects QStash callbacks with an invalid payload", async () => {
  let verificationCallCount = 0;

  const app = await buildTestApp({
    rebuildProjection: async () => {
      throw new Error("rebuild should not run for invalid payloads");
    },
    verifyQStashRequest: async () => {
      verificationCallCount += 1;
    },
  });

  try {
    const response = await app.inject({
      body: JSON.stringify({environmentId: "not-a-uuid"}),
      headers: {
        "content-type": "application/qstash+json",
        "upstash-signature": "valid-signature",
      },
      method: "POST",
      url: "/internal/projections/rebuild-async",
    });

    assert.equal(verificationCallCount, 1);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: "INVALID_REQUEST",
      message: "The QStash payload is missing required projection rebuild fields.",
    });
  } finally {
    await app.close();
  }
});

test("rebuilds the requested environment for verified QStash callbacks", async () => {
  const verificationInputs: Array<Record<string, string>> = [];
  const rebuildCalls: string[] = [];

  const app = await buildTestApp({
    rebuildProjection: async (_db, _redisUrl, environmentId) => {
      rebuildCalls.push(environmentId);

      return {
        projection: {
          environmentId,
          organizationId: "44444444-4444-4444-8444-444444444444",
          flags: {},
          generatedAt: "2026-03-31T00:00:00.000Z",
          projectId: "55555555-5555-4555-8555-555555555555",
          projectionVersion: 7,
        },
        redisKey: `ff:env_projection:${environmentId}`,
      };
    },
    verifyQStashRequest: async (input) => {
      verificationInputs.push({
        body: input.body,
        signature: input.signature,
        url: input.url,
      });
    },
  });

  try {
    const response = await app.inject({
      body: projectionRefreshBody,
      headers: {
        "content-type": "application/qstash+json",
        "upstash-signature": "valid-signature",
      },
      method: "POST",
      url: "/internal/projections/rebuild-async",
    });

    assert.equal(response.statusCode, 200);
    if (!qstashConfig.qstash?.publicApiBaseUrl) throw new Error("publicApiBaseUrl is required");
    assert.deepEqual(verificationInputs, [
      {
        body: projectionRefreshBody,
        signature: "valid-signature",
        url: buildQStashProjectionRefreshUrl(qstashConfig.qstash?.publicApiBaseUrl),
      },
    ]);
    assert.deepEqual(rebuildCalls, ["22222222-2222-4222-8222-222222222222"]);
    assert.deepEqual(response.json(), {
      environmentId: "22222222-2222-4222-8222-222222222222",
      flagCount: 0,
      generatedAt: "2026-03-31T00:00:00.000Z",
      projectionVersion: 7,
      redisKey: "ff:env_projection:22222222-2222-4222-8222-222222222222",
    });
  } finally {
    await app.close();
  }
});
