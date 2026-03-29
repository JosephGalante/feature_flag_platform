export type EvaluationReason =
  | "DEFAULT"
  | "DISABLED"
  | "FLAG_NOT_FOUND"
  | "INVALID_CONTEXT"
  | "RULE_MATCH";

export type CompiledFlagType = "boolean" | "variant";
export type CompiledFlagStatus = "active" | "archived";
export type CompiledRuleType = "attribute_match" | "percentage_rollout";
export type CompiledRuleOperator = "equals" | "in";

export type CompiledFlagVariant = {
  key: string;
  value: unknown;
  description?: string;
};

export type CompiledFlagRule = {
  ruleId: string;
  sortOrder: number;
  ruleType: CompiledRuleType;
  attributeKey?: string;
  operator?: CompiledRuleOperator;
  comparisonValue?: unknown;
  rolloutPercentage?: number;
  variantKey: string;
};

export type CompiledFlag = {
  flagKey: string;
  flagType: CompiledFlagType;
  status: CompiledFlagStatus;
  enabled: boolean;
  defaultVariantKey: string;
  variants: Record<string, CompiledFlagVariant>;
  rules: ReadonlyArray<CompiledFlagRule>;
  flagEnvironmentConfigId: string;
  projectionVersion: number;
};

export type CompiledEnvironmentProjection = {
  environmentId: string;
  projectId: string;
  organizationId: string;
  projectionVersion: number;
  generatedAt: string;
  flags: Record<string, CompiledFlag>;
};

export type EvaluationContext = Record<string, unknown>;

export type EvaluationResult = {
  flagKey: string;
  variantKey: string | null;
  value: unknown;
  reason: EvaluationReason;
  matchedRuleId: string | null;
  projectionVersion: number | null;
};

export type EvaluationBatchResult = Record<string, EvaluationResult>;
