import type {JsonValue} from "@shared/json";
import type {
  ConfigurationEnvironmentInput,
  ConfigurationRuleInput,
  ConfigurationVariantInput,
  EditableConfigurationSnapshot,
  FlagDetail,
} from "./flags.service";

type SnapshotVariantInput = {
  description: string | null;
  key: string;
  value: JsonValue;
};

type SnapshotRule = EditableConfigurationSnapshot["environments"][number]["rules"][number];
type SnapshotEnvironment = EditableConfigurationSnapshot["environments"][number];

function normalizeJsonValue(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item));
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, nestedValue]) => [key, normalizeJsonValue(nestedValue)]),
  );
}

function normalizeSnapshotVariants(
  variants: SnapshotVariantInput[],
): EditableConfigurationSnapshot["variants"] {
  return variants
    .map((variant) => ({
      description: variant.description,
      key: variant.key,
      value: normalizeJsonValue(variant.value),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function normalizeEditableRules(
  rules: FlagDetail["environments"][number]["rules"],
): SnapshotRule[] {
  return rules
    .map((rule) => ({
      attributeKey: rule.attributeKey,
      comparisonValue:
        rule.comparisonValue === null ? null : normalizeJsonValue(rule.comparisonValue),
      operator: rule.operator,
      rolloutPercentage: rule.rolloutPercentage,
      ruleType: rule.ruleType,
      sortOrder: rule.sortOrder,
      variantKey: rule.variantKey,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function normalizeRequestedRules(rules: ConfigurationRuleInput[]): SnapshotRule[] {
  return rules
    .map((rule) => ({
      attributeKey: rule.ruleType === "attribute_match" ? rule.attributeKey : null,
      comparisonValue:
        rule.ruleType === "attribute_match" ? normalizeJsonValue(rule.comparisonValue) : null,
      operator: rule.ruleType === "attribute_match" ? rule.operator : null,
      rolloutPercentage: rule.ruleType === "percentage_rollout" ? rule.rolloutPercentage : null,
      ruleType: rule.ruleType,
      sortOrder: rule.sortOrder,
      variantKey: rule.variantKey,
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function sortSnapshotEnvironments(environments: SnapshotEnvironment[]): SnapshotEnvironment[] {
  return environments.sort((left, right) => left.environmentId.localeCompare(right.environmentId));
}

export function buildEditableConfigurationSnapshot(
  detail: FlagDetail,
): EditableConfigurationSnapshot {
  return {
    environments: sortSnapshotEnvironments(
      detail.environments.map((environment) => ({
        defaultVariantKey: environment.config.defaultVariantKey,
        enabled: environment.config.enabled,
        environmentId: environment.environment.id,
        rules: normalizeEditableRules(environment.rules),
      })),
    ),
    variants: normalizeSnapshotVariants(detail.variants),
  };
}

export function buildRequestedConfigurationSnapshot(input: {
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
}): EditableConfigurationSnapshot {
  return {
    environments: sortSnapshotEnvironments(
      input.environments.map((environment) => ({
        defaultVariantKey: environment.defaultVariantKey,
        enabled: environment.enabled,
        environmentId: environment.environmentId,
        rules: normalizeRequestedRules(environment.rules),
      })),
    ),
    variants: normalizeSnapshotVariants(input.variants),
  };
}

export function validateConfigurationInput(input: {
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
}): void {
  const variantKeys = new Set<string>();

  for (const variant of input.variants) {
    if (variantKeys.has(variant.key)) {
      throw new Error(`Duplicate variant key "${variant.key}" in configuration request.`);
    }

    variantKeys.add(variant.key);
  }

  const environmentIds = new Set<string>();

  for (const environment of input.environments) {
    if (environmentIds.has(environment.environmentId)) {
      throw new Error(
        `Duplicate environment "${environment.environmentId}" in configuration request.`,
      );
    }

    environmentIds.add(environment.environmentId);

    if (!variantKeys.has(environment.defaultVariantKey)) {
      throw new Error(
        `Default variant key "${environment.defaultVariantKey}" does not exist for environment "${environment.environmentId}".`,
      );
    }

    const sortOrders = new Set<number>();

    for (const rule of environment.rules) {
      if (!variantKeys.has(rule.variantKey)) {
        throw new Error(
          `Rule variant key "${rule.variantKey}" does not exist for environment "${environment.environmentId}" at sort order ${rule.sortOrder}.`,
        );
      }

      if (!Number.isInteger(rule.sortOrder) || rule.sortOrder < 0) {
        throw new Error(
          `Rule sort order ${rule.sortOrder} is invalid for environment "${environment.environmentId}". Sort orders must be non-negative integers.`,
        );
      }

      if (sortOrders.has(rule.sortOrder)) {
        throw new Error(
          `Duplicate rule sort order ${rule.sortOrder} for environment "${environment.environmentId}".`,
        );
      }

      sortOrders.add(rule.sortOrder);

      if (
        rule.ruleType === "percentage_rollout" &&
        (!Number.isFinite(rule.rolloutPercentage) ||
          rule.rolloutPercentage < 0 ||
          rule.rolloutPercentage > 100)
      ) {
        throw new Error(
          `Rollout percentage ${rule.rolloutPercentage} is out of bounds for environment "${environment.environmentId}" at sort order ${rule.sortOrder}. Expected a value between 0 and 100.`,
        );
      }
    }
  }
}
