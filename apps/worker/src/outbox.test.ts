import assert from "node:assert/strict";
import test from "node:test";
import {computeRetryDelayMs, readProjectionRefreshPayload} from "./outbox";

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
