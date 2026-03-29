import assert from "node:assert/strict";
import test from "node:test";
import {evaluateFlag, evaluateFlags, getRolloutBucket} from "./index";
import type {CompiledEnvironmentProjection, CompiledFlag} from "./types";

const baseFlag: CompiledFlag = {
  flagEnvironmentConfigId: "cfg_1",
  flagKey: "new_checkout",
  flagType: "boolean",
  status: "active",
  enabled: true,
  defaultVariantKey: "off",
  projectionVersion: 7,
  variants: {
    off: {key: "off", value: false, description: "Disabled"},
    on: {key: "on", value: true, description: "Enabled"},
  },
  rules: [],
};

function createProjection(
  flagOverrides: Partial<CompiledFlag> = {},
): CompiledEnvironmentProjection {
  const flag: CompiledFlag = {
    ...baseFlag,
    ...flagOverrides,
    rules: flagOverrides.rules ?? baseFlag.rules,
    variants: flagOverrides.variants ?? baseFlag.variants,
  };

  return {
    environmentId: "env_staging",
    projectId: "proj_checkout",
    organizationId: "org_acme",
    projectionVersion: 7,
    generatedAt: "2026-03-29T12:00:00.000Z",
    flags: {
      [flag.flagKey]: flag,
    },
  };
}

function findSubjectKey(
  projection: CompiledEnvironmentProjection,
  flagKey: string,
  predicate: (bucket: number) => boolean,
): string {
  for (let index = 0; index < 10_000; index += 1) {
    const subjectKey = `subject-${index}`;
    const bucket = getRolloutBucket(flagKey, projection.environmentId, subjectKey);

    if (predicate(bucket)) {
      return subjectKey;
    }
  }

  throw new Error("Failed to find subject key matching rollout predicate");
}

test("returns FLAG_NOT_FOUND when the flag does not exist", () => {
  const projection = createProjection();
  const result = evaluateFlag(projection, "missing_flag", {userId: "user-1"});

  assert.deepEqual(result, {
    flagKey: "missing_flag",
    matchedRuleId: null,
    projectionVersion: null,
    reason: "FLAG_NOT_FOUND",
    value: null,
    variantKey: null,
  });
});

test("treats archived flags as unavailable and returns FLAG_NOT_FOUND", () => {
  const projection = createProjection({status: "archived"});
  const result = evaluateFlag(projection, "new_checkout", {userId: "user-1"});

  assert.equal(result.reason, "FLAG_NOT_FOUND");
  assert.equal(result.variantKey, null);
  assert.equal(result.projectionVersion, null);
});

test("returns the default variant with DISABLED when the flag is off in the environment", () => {
  const projection = createProjection({enabled: false});
  const result = evaluateFlag(projection, "new_checkout", {userId: "user-1"});

  assert.deepEqual(result, {
    flagKey: "new_checkout",
    matchedRuleId: null,
    projectionVersion: 7,
    reason: "DISABLED",
    value: false,
    variantKey: "off",
  });
});

test("matches attribute equals rules before falling back to default", () => {
  const projection = createProjection({
    rules: [
      {
        ruleId: "rule_equals",
        sortOrder: 10,
        ruleType: "attribute_match",
        attributeKey: "email",
        operator: "equals",
        comparisonValue: "alice@example.com",
        variantKey: "on",
      },
    ],
  });

  const result = evaluateFlag(projection, "new_checkout", {email: "alice@example.com"});

  assert.deepEqual(result, {
    flagKey: "new_checkout",
    matchedRuleId: "rule_equals",
    projectionVersion: 7,
    reason: "RULE_MATCH",
    value: true,
    variantKey: "on",
  });
});

test("matches attribute in rules", () => {
  const projection = createProjection({
    rules: [
      {
        ruleId: "rule_in",
        sortOrder: 10,
        ruleType: "attribute_match",
        attributeKey: "email",
        operator: "in",
        comparisonValue: ["alice@example.com", "bob@example.com"],
        variantKey: "on",
      },
    ],
  });

  const result = evaluateFlag(projection, "new_checkout", {email: "bob@example.com"});

  assert.equal(result.reason, "RULE_MATCH");
  assert.equal(result.matchedRuleId, "rule_in");
  assert.equal(result.variantKey, "on");
  assert.equal(result.value, true);
});

test("returns DEFAULT when no rule matches", () => {
  const projection = createProjection({
    rules: [
      {
        ruleId: "rule_equals",
        sortOrder: 10,
        ruleType: "attribute_match",
        attributeKey: "country",
        operator: "equals",
        comparisonValue: "CA",
        variantKey: "on",
      },
    ],
  });

  const result = evaluateFlag(projection, "new_checkout", {country: "US"});

  assert.equal(result.reason, "DEFAULT");
  assert.equal(result.variantKey, "off");
  assert.equal(result.value, false);
});

test("uses a stable rollout bucket for percentage rules", () => {
  const projection = createProjection({
    rules: [
      {
        ruleId: "rule_rollout",
        sortOrder: 20,
        ruleType: "percentage_rollout",
        rolloutPercentage: 20,
        variantKey: "on",
      },
    ],
  });

  const includedSubjectKey = findSubjectKey(projection, "new_checkout", (bucket) => bucket < 2_000);
  const excludedSubjectKey = findSubjectKey(
    projection,
    "new_checkout",
    (bucket) => bucket >= 2_000,
  );

  const firstIncludedResult = evaluateFlag(projection, "new_checkout", {
    subjectKey: includedSubjectKey,
  });
  const secondIncludedResult = evaluateFlag(projection, "new_checkout", {
    subjectKey: includedSubjectKey,
  });
  const excludedResult = evaluateFlag(projection, "new_checkout", {subjectKey: excludedSubjectKey});

  assert.equal(firstIncludedResult.reason, "RULE_MATCH");
  assert.equal(firstIncludedResult.variantKey, "on");
  assert.deepEqual(firstIncludedResult, secondIncludedResult);
  assert.equal(excludedResult.reason, "DEFAULT");
  assert.equal(excludedResult.variantKey, "off");
});

test("returns INVALID_CONTEXT when a percentage rule cannot derive a subject key", () => {
  const projection = createProjection({
    rules: [
      {
        ruleId: "rule_rollout",
        sortOrder: 20,
        ruleType: "percentage_rollout",
        rolloutPercentage: 50,
        variantKey: "on",
      },
    ],
  });

  const result = evaluateFlag(projection, "new_checkout", {email: "alice@example.com"});

  assert.deepEqual(result, {
    flagKey: "new_checkout",
    matchedRuleId: null,
    projectionVersion: 7,
    reason: "INVALID_CONTEXT",
    value: null,
    variantKey: null,
  });
});

test("returns INVALID_CONTEXT when a matched attribute value is not a string", () => {
  const projection = createProjection({
    rules: [
      {
        ruleId: "rule_equals",
        sortOrder: 10,
        ruleType: "attribute_match",
        attributeKey: "plan",
        operator: "equals",
        comparisonValue: "pro",
        variantKey: "on",
      },
    ],
  });

  const result = evaluateFlag(projection, "new_checkout", {plan: ["pro"]});

  assert.equal(result.reason, "INVALID_CONTEXT");
  assert.equal(result.variantKey, null);
});

test("evaluates many flags in one pass", () => {
  const projection = createProjection();
  projection.flags.new_nav = {
    ...baseFlag,
    flagKey: "new_nav",
    projectionVersion: 8,
    variants: {
      off: {key: "off", value: "control"},
      on: {key: "on", value: "variant"},
    },
    defaultVariantKey: "on",
  };

  const results = evaluateFlags(projection, ["new_checkout", "new_nav", "missing_flag"], {
    userId: "user-1",
  });

  assert.deepEqual(results, {
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
      matchedRuleId: null,
      projectionVersion: 7,
      reason: "DEFAULT",
      value: false,
      variantKey: "off",
    },
    new_nav: {
      flagKey: "new_nav",
      matchedRuleId: null,
      projectionVersion: 8,
      reason: "DEFAULT",
      value: "variant",
      variantKey: "on",
    },
  });
});
