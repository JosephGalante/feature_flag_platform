import type {
  ConfigurationEnvironmentInput,
  ConfigurationRuleInput,
  ConfigurationVariantInput,
  FlagDetail,
} from "../../admin/flags/flags.service";
import type {ConfigurationBody} from "./schemas";

export function toConfigurationInputs(body: ConfigurationBody): {
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
} {
  return {
    environments: body.environments.map((environment) => ({
      defaultVariantKey: environment.defaultVariantKey,
      enabled: environment.enabled,
      environmentId: environment.environmentId,
      rules: environment.rules.map(
        (rule): ConfigurationRuleInput =>
          rule.ruleType === "attribute_match"
            ? {
                attributeKey: rule.attributeKey,
                comparisonValue: rule.comparisonValue,
                operator: rule.operator,
                ruleType: "attribute_match",
                sortOrder: rule.sortOrder,
                variantKey: rule.variantKey,
              }
            : {
                rolloutPercentage: rule.rolloutPercentage,
                ruleType: "percentage_rollout",
                sortOrder: rule.sortOrder,
                variantKey: rule.variantKey,
              },
      ),
    })),
    variants: body.variants.map((variant) => ({
      description: variant.description ?? null,
      key: variant.key,
      value: variant.value,
    })),
  };
}

export function validateConfigurationPayload(input: {
  currentDetail: FlagDetail;
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
}): string[] {
  const issues: string[] = [];
  const variantKeys = new Set<string>();

  if (input.variants.length === 0) {
    issues.push("variants must contain at least one variant.");
  }

  for (const variant of input.variants) {
    if (variantKeys.has(variant.key)) {
      issues.push(`variants contains duplicate key '${variant.key}'.`);
      continue;
    }

    variantKeys.add(variant.key);
  }

  const expectedEnvironmentIds = new Set<string>(
    input.currentDetail.environments.map((environment) => environment.environment.id),
  );
  const seenEnvironmentIds = new Set<string>();

  if (input.environments.length !== expectedEnvironmentIds.size) {
    issues.push("environments must include every existing project environment exactly once.");
  }

  for (const environment of input.environments) {
    if (!expectedEnvironmentIds.has(environment.environmentId)) {
      issues.push(`environment '${environment.environmentId}' does not belong to this flag.`);
    }

    if (seenEnvironmentIds.has(environment.environmentId)) {
      issues.push(`environments contains duplicate environmentId '${environment.environmentId}'.`);
      continue;
    }

    seenEnvironmentIds.add(environment.environmentId);

    if (!variantKeys.has(environment.defaultVariantKey)) {
      issues.push(
        `environment '${environment.environmentId}' references missing defaultVariantKey '${environment.defaultVariantKey}'.`,
      );
    }

    const seenSortOrders = new Set<number>();

    for (const rule of environment.rules) {
      if (seenSortOrders.has(rule.sortOrder)) {
        issues.push(
          `environment '${environment.environmentId}' contains duplicate sortOrder '${rule.sortOrder}'.`,
        );
      } else {
        seenSortOrders.add(rule.sortOrder);
      }

      if (!variantKeys.has(rule.variantKey)) {
        issues.push(
          `environment '${environment.environmentId}' rule '${rule.sortOrder}' references missing variantKey '${rule.variantKey}'.`,
        );
      }

      if (rule.ruleType === "attribute_match") {
        if (rule.operator === "equals" && typeof rule.comparisonValue !== "string") {
          issues.push(
            `environment '${environment.environmentId}' rule '${rule.sortOrder}' must use a string comparisonValue for equals.`,
          );
        }

        if (rule.operator === "in" && !Array.isArray(rule.comparisonValue)) {
          issues.push(
            `environment '${environment.environmentId}' rule '${rule.sortOrder}' must use an array comparisonValue for in.`,
          );
        }
      }
    }
  }

  for (const environmentId of expectedEnvironmentIds) {
    if (!seenEnvironmentIds.has(environmentId)) {
      issues.push(`environments is missing required environment '${environmentId}'.`);
    }
  }

  return issues;
}
