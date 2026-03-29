import {getRolloutBucket, getRolloutThreshold} from "./hash.js";
import type {
  CompiledEnvironmentProjection,
  CompiledFlag,
  CompiledFlagRule,
  EvaluationBatchResult,
  EvaluationContext,
  EvaluationReason,
  EvaluationResult,
} from "./types.js";

type VariantResolution = {
  value: unknown;
  variantKey: string | null;
};

type RuleMatchResult = {kind: "invalid_context"} | {kind: "match"} | {kind: "no_match"};

export function evaluateFlag(
  projection: CompiledEnvironmentProjection,
  flagKey: string,
  context: EvaluationContext,
): EvaluationResult {
  const flag = projection.flags[flagKey];

  if (!flag || flag.status !== "active") {
    return buildResult(flagKey, "FLAG_NOT_FOUND", null, null, null);
  }

  if (!flag.enabled) {
    return resolveResult(flag, flag.defaultVariantKey, "DISABLED", null);
  }

  const rules = [...flag.rules].sort((left, right) => left.sortOrder - right.sortOrder);

  for (const rule of rules) {
    const match = doesRuleMatch(projection, flag, rule, context);

    if (match.kind === "invalid_context") {
      return buildResult(flag.flagKey, "INVALID_CONTEXT", null, null, flag.projectionVersion);
    }

    if (match.kind === "match") {
      return resolveResult(flag, rule.variantKey, "RULE_MATCH", rule.ruleId);
    }
  }

  return resolveResult(flag, flag.defaultVariantKey, "DEFAULT", null);
}

export function evaluateFlags(
  projection: CompiledEnvironmentProjection,
  flagKeys: ReadonlyArray<string>,
  context: EvaluationContext,
): EvaluationBatchResult {
  return Object.fromEntries(
    flagKeys.map((flagKey) => [flagKey, evaluateFlag(projection, flagKey, context)]),
  );
}

function doesRuleMatch(
  projection: CompiledEnvironmentProjection,
  flag: CompiledFlag,
  rule: CompiledFlagRule,
  context: EvaluationContext,
): RuleMatchResult {
  if (rule.ruleType === "attribute_match") {
    return doesAttributeRuleMatch(rule, context);
  }

  if (rule.ruleType === "percentage_rollout") {
    return doesPercentageRuleMatch(projection, flag, rule, context);
  }

  return {kind: "no_match"};
}

function doesAttributeRuleMatch(
  rule: CompiledFlagRule,
  context: EvaluationContext,
): RuleMatchResult {
  if (!rule.attributeKey || !rule.operator) {
    return {kind: "no_match"};
  }

  const rawContextValue = context[rule.attributeKey];

  if (rawContextValue === undefined) {
    return {kind: "no_match"};
  }

  if (typeof rawContextValue !== "string") {
    return {kind: "invalid_context"};
  }

  if (rule.operator === "equals") {
    return {
      kind:
        typeof rule.comparisonValue === "string" && rawContextValue === rule.comparisonValue
          ? "match"
          : "no_match",
    };
  }

  if (rule.operator === "in") {
    if (!Array.isArray(rule.comparisonValue)) {
      return {kind: "no_match"};
    }

    const values = rule.comparisonValue.filter(
      (value): value is string => typeof value === "string",
    );
    return {kind: values.includes(rawContextValue) ? "match" : "no_match"};
  }

  return {kind: "no_match"};
}

function doesPercentageRuleMatch(
  projection: CompiledEnvironmentProjection,
  flag: CompiledFlag,
  rule: CompiledFlagRule,
  context: EvaluationContext,
): RuleMatchResult {
  const subjectKey = getSubjectKey(context);

  if (subjectKey.kind === "invalid_context") {
    return subjectKey;
  }

  if (subjectKey.kind === "missing") {
    return {kind: "invalid_context"};
  }

  if (typeof rule.rolloutPercentage !== "number") {
    return {kind: "no_match"};
  }

  const threshold = getRolloutThreshold(rule.rolloutPercentage);
  const bucket = getRolloutBucket(flag.flagKey, projection.environmentId, subjectKey.value);

  return {kind: bucket < threshold ? "match" : "no_match"};
}

function getSubjectKey(
  context: EvaluationContext,
): {kind: "invalid_context"} | {kind: "missing"} | {kind: "ok"; value: string} {
  const userId = context.userId;

  if (userId !== undefined) {
    if (typeof userId !== "string") {
      return {kind: "invalid_context"};
    }

    if (userId.length > 0) {
      return {kind: "ok", value: userId};
    }
  }

  const subjectKey = context.subjectKey;

  if (subjectKey !== undefined) {
    if (typeof subjectKey !== "string") {
      return {kind: "invalid_context"};
    }

    if (subjectKey.length > 0) {
      return {kind: "ok", value: subjectKey};
    }
  }

  return {kind: "missing"};
}

function resolveResult(
  flag: CompiledFlag,
  variantKey: string,
  reason: Exclude<EvaluationReason, "FLAG_NOT_FOUND" | "INVALID_CONTEXT">,
  matchedRuleId: string | null,
): EvaluationResult {
  const resolution = resolveVariant(flag, variantKey);

  return buildResult(
    flag.flagKey,
    reason,
    resolution.variantKey,
    resolution.value,
    flag.projectionVersion,
    matchedRuleId,
  );
}

function resolveVariant(flag: CompiledFlag, variantKey: string): VariantResolution {
  const variant = flag.variants[variantKey] ?? null;

  return {
    value: variant?.value ?? null,
    variantKey: variant?.key ?? null,
  };
}

function buildResult(
  flagKey: string,
  reason: EvaluationReason,
  variantKey: string | null,
  value: unknown,
  projectionVersion: number | null,
  matchedRuleId: string | null = null,
): EvaluationResult {
  return {
    flagKey,
    matchedRuleId,
    projectionVersion,
    reason,
    value,
    variantKey,
  };
}
