import assert from "node:assert/strict";
import test from "node:test";
import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import {previewFlagBatchEvaluation, previewFlagEvaluation} from "./preview-flag-evaluation";

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
      rules: [
        {
          attributeKey: "email",
          comparisonValue: "alice@example.com",
          operator: "equals",
          ruleId: "rule_email",
          ruleType: "attribute_match",
          sortOrder: 10,
          variantKey: "on",
        },
      ],
      status: "active",
      variants: {
        off: {key: "off", value: false},
        on: {key: "on", value: true},
      },
    },
  },
  generatedAt: "2026-03-30T04:30:00.000Z",
  organizationId: "org_acme",
  projectId: "proj_checkout",
  projectionVersion: 7,
};

test("returns projection_not_found when Redis has no environment projection", async () => {
  const result = await previewFlagEvaluation(
    {
      readProjection: async () => null,
    },
    {
      context: {},
      environmentId: "env_missing",
      flagKey: "new_checkout",
    },
  );

  assert.deepEqual(result, {
    status: "projection_not_found",
  });
});

test("returns projection_not_found for batch evaluation when Redis has no environment projection", async () => {
  const result = await previewFlagBatchEvaluation(
    {
      readProjection: async () => null,
    },
    {
      context: {},
      environmentId: "env_missing",
      flagKeys: ["new_checkout"],
    },
  );

  assert.deepEqual(result, {
    status: "projection_not_found",
  });
});

test("evaluates the requested flag against the loaded Redis projection", async () => {
  const result = await previewFlagEvaluation(
    {
      readProjection: async () => projection,
    },
    {
      context: {
        email: "alice@example.com",
      },
      environmentId: "env_staging",
      flagKey: "new_checkout",
    },
  );

  assert.deepEqual(result, {
    result: {
      flagKey: "new_checkout",
      matchedRuleId: "rule_email",
      projectionVersion: 7,
      reason: "RULE_MATCH",
      value: true,
      variantKey: "on",
    },
    status: "ok",
  });
});

test("evaluates multiple flags against the loaded Redis projection", async () => {
  const result = await previewFlagBatchEvaluation(
    {
      readProjection: async () => projection,
    },
    {
      context: {
        email: "alice@example.com",
      },
      environmentId: "env_staging",
      flagKeys: ["new_checkout", "missing_flag"],
    },
  );

  assert.deepEqual(result, {
    result: {
      missing_flag: {
        flagKey: "missing_flag",
        matchedRuleId: null,
        projectionVersion: null,
        reason: "FLAG_NOT_FOUND",
        value: null,
        variantKey: null,
      },
      new_checkout: {
        flagKey: "new_checkout",
        matchedRuleId: "rule_email",
        projectionVersion: 7,
        reason: "RULE_MATCH",
        value: true,
        variantKey: "on",
      },
    },
    status: "ok",
  });
});
