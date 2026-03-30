import assert from "node:assert/strict";
import test from "node:test";
import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import {
  buildEnvironmentProjectionRedisKey,
  parseEnvironmentProjection,
  serializeEnvironmentProjection,
} from "./redis-projections";

const projection: CompiledEnvironmentProjection = {
  environmentId: "env_staging",
  flags: {
    new_checkout: {
      defaultVariantKey: "off",
      enabled: true,
      flagEnvironmentConfigId: "cfg_checkout",
      flagKey: "new_checkout",
      flagType: "boolean",
      projectionVersion: 7,
      rules: [],
      status: "active",
      variants: {
        off: {key: "off", value: false},
        on: {key: "on", value: true},
      },
    },
  },
  generatedAt: "2026-03-29T23:00:00.000Z",
  organizationId: "org_acme",
  projectId: "proj_checkout",
  projectionVersion: 7,
};

test("builds the documented Redis key shape for environment projections", () => {
  assert.equal(buildEnvironmentProjectionRedisKey("env_staging"), "ff:env_projection:env_staging");
});

test("serializes and parses an environment projection without loss", () => {
  const payload = serializeEnvironmentProjection(projection);

  assert.deepEqual(parseEnvironmentProjection(payload), projection);
});

test("throws a useful error for invalid projection payloads", () => {
  assert.throws(
    () => parseEnvironmentProjection("{not-json"),
    /Invalid environment projection payload:/,
  );
});
