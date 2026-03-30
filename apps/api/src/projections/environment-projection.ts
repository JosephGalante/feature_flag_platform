import type {
  CompiledEnvironmentProjection,
  CompiledFlag,
  CompiledFlagRule,
  CompiledFlagVariant,
} from "@feature-flag-platform/evaluation-core";
import {
  environments,
  featureFlags,
  flagEnvironmentConfigs,
  flagRules,
  flagVariants,
  projects,
} from "@shared/database";
import type {JsonValue} from "@shared/json";
import {asc, eq, inArray} from "drizzle-orm";
import type {ApiDatabase} from "../lib/database";

type EnvironmentProjectionVariantSource = {
  description: string | null;
  key: string;
  value: JsonValue;
};

type EnvironmentProjectionRuleSource = {
  attributeKey: string | null;
  comparisonValue: JsonValue | null;
  createdAt: Date;
  id: string;
  operator: "equals" | "in" | null;
  rolloutPercentage: number | null;
  ruleType: "attribute_match" | "percentage_rollout";
  sortOrder: number;
  variantKey: string;
};

type EnvironmentProjectionFlagSource = {
  defaultVariantKey: string;
  enabled: boolean;
  flagEnvironmentConfigId: string;
  flagKey: string;
  flagType: "boolean" | "variant";
  projectionVersion: number;
  rules: EnvironmentProjectionRuleSource[];
  status: "active" | "archived";
  variants: EnvironmentProjectionVariantSource[];
};

export type EnvironmentProjectionSource = {
  environmentId: string;
  flags: EnvironmentProjectionFlagSource[];
  organizationId: string;
  projectId: string;
};

function compileVariant(source: EnvironmentProjectionVariantSource): CompiledFlagVariant {
  return source.description === null
    ? {
        key: source.key,
        value: source.value,
      }
    : {
        description: source.description,
        key: source.key,
        value: source.value,
      };
}

function compileRule(source: EnvironmentProjectionRuleSource): CompiledFlagRule {
  const compiledRule: CompiledFlagRule = {
    ruleId: source.id,
    ruleType: source.ruleType,
    sortOrder: source.sortOrder,
    variantKey: source.variantKey,
  };

  if (source.attributeKey !== null) {
    compiledRule.attributeKey = source.attributeKey;
  }

  if (source.operator !== null) {
    compiledRule.operator = source.operator;
  }

  if (source.comparisonValue !== null) {
    compiledRule.comparisonValue = source.comparisonValue;
  }

  if (source.rolloutPercentage !== null) {
    compiledRule.rolloutPercentage = source.rolloutPercentage;
  }

  return compiledRule;
}

function compileFlag(source: EnvironmentProjectionFlagSource): CompiledFlag {
  const variants = Object.fromEntries(
    source.variants.map((variant) => [variant.key, compileVariant(variant)]),
  );
  const rules = [...source.rules]
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime(),
    )
    .map(compileRule);

  return {
    defaultVariantKey: source.defaultVariantKey,
    enabled: source.enabled,
    flagEnvironmentConfigId: source.flagEnvironmentConfigId,
    flagKey: source.flagKey,
    flagType: source.flagType,
    projectionVersion: source.projectionVersion,
    rules,
    status: source.status,
    variants,
  };
}

function buildProjectionVersion(flags: EnvironmentProjectionFlagSource[]): number {
  return flags.reduce(
    (maxProjectionVersion, flag) => Math.max(maxProjectionVersion, flag.projectionVersion),
    0,
  );
}

export function compileEnvironmentProjection(
  source: EnvironmentProjectionSource,
  generatedAt: Date = new Date(),
): CompiledEnvironmentProjection {
  return {
    environmentId: source.environmentId,
    flags: Object.fromEntries(source.flags.map((flag) => [flag.flagKey, compileFlag(flag)])),
    generatedAt: generatedAt.toISOString(),
    organizationId: source.organizationId,
    projectId: source.projectId,
    projectionVersion: buildProjectionVersion(source.flags),
  };
}

export async function getEnvironmentProjectionSource(
  db: ApiDatabase,
  environmentId: string,
): Promise<EnvironmentProjectionSource | null> {
  const [environmentRow] = await db
    .select({
      environmentId: environments.id,
      organizationId: projects.organizationId,
      projectId: environments.projectId,
    })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(environments.id, environmentId))
    .limit(1);

  if (!environmentRow) {
    return null;
  }

  const configRows = await db
    .select({
      defaultVariantKey: flagEnvironmentConfigs.defaultVariantKey,
      enabled: flagEnvironmentConfigs.enabled,
      featureFlagId: featureFlags.id,
      flagEnvironmentConfigId: flagEnvironmentConfigs.id,
      flagKey: featureFlags.key,
      flagType: featureFlags.flagType,
      projectionVersion: flagEnvironmentConfigs.projectionVersion,
      status: featureFlags.status,
    })
    .from(flagEnvironmentConfigs)
    .innerJoin(featureFlags, eq(flagEnvironmentConfigs.featureFlagId, featureFlags.id))
    .where(eq(flagEnvironmentConfigs.environmentId, environmentId))
    .orderBy(asc(featureFlags.key));

  const featureFlagIds = configRows.map((row) => row.featureFlagId);
  const configIds = configRows.map((row) => row.flagEnvironmentConfigId);

  const variantRows =
    featureFlagIds.length === 0
      ? []
      : await db
          .select({
            description: flagVariants.description,
            featureFlagId: flagVariants.featureFlagId,
            key: flagVariants.key,
            value: flagVariants.valueJson,
          })
          .from(flagVariants)
          .where(inArray(flagVariants.featureFlagId, featureFlagIds))
          .orderBy(asc(flagVariants.key));

  const ruleRows =
    configIds.length === 0
      ? []
      : await db
          .select({
            attributeKey: flagRules.attributeKey,
            comparisonValue: flagRules.comparisonValueJson,
            createdAt: flagRules.createdAt,
            flagEnvironmentConfigId: flagRules.flagEnvironmentConfigId,
            id: flagRules.id,
            operator: flagRules.operator,
            rolloutPercentage: flagRules.rolloutPercentage,
            ruleType: flagRules.ruleType,
            sortOrder: flagRules.sortOrder,
            variantKey: flagRules.variantKey,
          })
          .from(flagRules)
          .where(inArray(flagRules.flagEnvironmentConfigId, configIds))
          .orderBy(asc(flagRules.sortOrder), asc(flagRules.createdAt));

  const variantsByFlagId = new Map<string, EnvironmentProjectionVariantSource[]>();

  for (const row of variantRows) {
    const existing = variantsByFlagId.get(row.featureFlagId) ?? [];
    existing.push({
      description: row.description,
      key: row.key,
      value: row.value,
    });
    variantsByFlagId.set(row.featureFlagId, existing);
  }

  const rulesByConfigId = new Map<string, EnvironmentProjectionRuleSource[]>();

  for (const row of ruleRows) {
    const existing = rulesByConfigId.get(row.flagEnvironmentConfigId) ?? [];
    existing.push({
      attributeKey: row.attributeKey,
      comparisonValue: row.comparisonValue,
      createdAt: row.createdAt,
      id: row.id,
      operator: row.operator,
      rolloutPercentage: row.rolloutPercentage,
      ruleType: row.ruleType,
      sortOrder: row.sortOrder,
      variantKey: row.variantKey,
    });
    rulesByConfigId.set(row.flagEnvironmentConfigId, existing);
  }

  return {
    environmentId: environmentRow.environmentId,
    flags: configRows.map((row) => ({
      defaultVariantKey: row.defaultVariantKey,
      enabled: row.enabled,
      flagEnvironmentConfigId: row.flagEnvironmentConfigId,
      flagKey: row.flagKey,
      flagType: row.flagType,
      projectionVersion: row.projectionVersion,
      rules: rulesByConfigId.get(row.flagEnvironmentConfigId) ?? [],
      status: row.status,
      variants: variantsByFlagId.get(row.featureFlagId) ?? [],
    })),
    organizationId: environmentRow.organizationId,
    projectId: environmentRow.projectId,
  };
}

export async function buildEnvironmentProjection(
  db: ApiDatabase,
  environmentId: string,
  generatedAt: Date = new Date(),
): Promise<CompiledEnvironmentProjection | null> {
  const source = await getEnvironmentProjectionSource(db, environmentId);

  if (!source) {
    return null;
  }

  return compileEnvironmentProjection(source, generatedAt);
}
