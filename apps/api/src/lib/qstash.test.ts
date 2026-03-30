import assert from "node:assert/strict";
import test from "node:test";
import type {QStashConfig} from "../config";
import type {ProjectionRefreshJobInput} from "../projections/refresh-jobs";
import {
  buildQStashProjectionRefreshUrl,
  publishProjectionRefreshJobs,
  verifyQStashRequest,
} from "./qstash";

const qstashConfig: QStashConfig = {
  currentSigningKey: "current-signing-key",
  nextSigningKey: "next-signing-key",
  publicApiBaseUrl: "https://feature-flag-platform-api.onrender.com",
  token: "qstash-token",
};

const projectionRefreshJob: ProjectionRefreshJobInput = {
  actorUserId: "11111111-1111-4111-8111-111111111111",
  environmentId: "22222222-2222-4222-8222-222222222222",
  featureFlagId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  projectId: "55555555-5555-4555-8555-555555555555",
  reason: "flag.configuration.updated",
  requestId: "req_123",
};

test("publishes projection refresh jobs to the signed callback route", async () => {
  const publishedRequests: Array<Record<string, unknown>> = [];

  await publishProjectionRefreshJobs(qstashConfig, [projectionRefreshJob], {
    createPublisher: () => ({
      publish: async (request) => {
        publishedRequests.push(request as Record<string, unknown>);
        return {messageId: "msg_123"};
      },
    }),
  });

  assert.equal(publishedRequests.length, 1);
  assert.deepEqual(publishedRequests[0], {
    body: JSON.stringify({
      environmentId: projectionRefreshJob.environmentId,
      featureFlagId: projectionRefreshJob.featureFlagId,
      organizationId: projectionRefreshJob.organizationId,
      projectId: projectionRefreshJob.projectId,
      reason: projectionRefreshJob.reason,
      requestId: projectionRefreshJob.requestId,
      triggeredByUserId: projectionRefreshJob.actorUserId,
    }),
    contentBasedDeduplication: true,
    headers: {
      "content-type": "application/qstash+json",
    },
    retries: 5,
    timeout: "30s",
    url: buildQStashProjectionRefreshUrl(qstashConfig.publicApiBaseUrl),
  });
});

test("verifies signed QStash callbacks with the raw body", async () => {
  const verifyCalls: Array<{body: string; signature: string; url: string}> = [];

  await verifyQStashRequest(
    qstashConfig,
    {
      body: '{"hello":"world"}',
      signature: "upstash-signature",
      url: "https://feature-flag-platform-api.onrender.com/internal/projections/rebuild-async",
    },
    {
      createReceiver: () => ({
        verify: async (request) => {
          verifyCalls.push({
            body: request.body,
            signature: request.signature,
            url: request.url ?? "",
          });
          return true;
        },
      }),
    },
  );

  assert.deepEqual(verifyCalls, [
    {
      body: '{"hello":"world"}',
      signature: "upstash-signature",
      url: "https://feature-flag-platform-api.onrender.com/internal/projections/rebuild-async",
    },
  ]);
});
