import {
  type FeatureFlagStatus,
  environments,
  featureFlags,
  flagEnvironmentConfigs,
  flagRules,
  flagVariants,
  memberships,
  projects,
} from "@shared/database";
import {type SQL, and, asc, desc, eq, ilike, inArray, or} from "drizzle-orm";
import type {ApiDatabase} from "../../lib/database";
import type {AuthorizedFlagAccess, FlagDetail, FlagRuleDetail, FlagSummary} from "./flags.service";

type ListProjectFlagsInput = {
  projectId: string;
  search?: string;
  status?: FeatureFlagStatus;
};

export const flagSummarySelect = {
  createdAt: featureFlags.createdAt,
  createdByUserId: featureFlags.createdByUserId,
  description: featureFlags.description,
  flagType: featureFlags.flagType,
  id: featureFlags.id,
  key: featureFlags.key,
  name: featureFlags.name,
  projectId: featureFlags.projectId,
  status: featureFlags.status,
  updatedAt: featureFlags.updatedAt,
};

const flagSummarySelectWithOrg = {
  ...flagSummarySelect,
  organizationId: projects.organizationId,
};

async function selectFlagSummary(db: ApiDatabase, flagId: string): Promise<FlagSummary | null> {
  const [flag] = await db
    .select(flagSummarySelectWithOrg)
    .from(featureFlags)
    .innerJoin(projects, eq(featureFlags.projectId, projects.id))
    .where(eq(featureFlags.id, flagId))
    .limit(1);

  return flag ?? null;
}

export async function listFlagsForProject(
  db: ApiDatabase,
  input: ListProjectFlagsInput,
): Promise<FlagSummary[]> {
  const conditions: SQL[] = [eq(featureFlags.projectId, input.projectId)];

  if (input.status) {
    conditions.push(eq(featureFlags.status, input.status));
  }

  if (input.search) {
    const pattern = `%${input.search}%`;
    const searchCondition = or(ilike(featureFlags.key, pattern), ilike(featureFlags.name, pattern));

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  return db
    .select(flagSummarySelectWithOrg)
    .from(featureFlags)
    .innerJoin(projects, eq(featureFlags.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(desc(featureFlags.updatedAt), asc(featureFlags.name));
}

export async function findAuthorizedFlagAccess(
  db: ApiDatabase,
  flagId: string,
  userId: string,
): Promise<AuthorizedFlagAccess | null> {
  const [flag] = await db
    .select({...flagSummarySelectWithOrg, role: memberships.role})
    .from(featureFlags)
    .innerJoin(projects, eq(featureFlags.projectId, projects.id))
    .innerJoin(memberships, eq(projects.organizationId, memberships.organizationId))
    .where(and(eq(featureFlags.id, flagId), eq(memberships.userId, userId)))
    .limit(1);

  if (!flag) {
    return null;
  }

  const {role, ...flagData} = flag;

  return {
    flag: flagData,
    role,
  };
}

export async function getFlagDetail(db: ApiDatabase, flagId: string): Promise<FlagDetail | null> {
  const flag = await selectFlagSummary(db, flagId);

  if (!flag) {
    return null;
  }

  const variants = await db
    .select({
      description: flagVariants.description,
      id: flagVariants.id,
      key: flagVariants.key,
      value: flagVariants.valueJson,
    })
    .from(flagVariants)
    .where(eq(flagVariants.featureFlagId, flagId))
    .orderBy(asc(flagVariants.key));

  const environmentRows = await db
    .select({
      configDefaultVariantKey: flagEnvironmentConfigs.defaultVariantKey,
      configEnabled: flagEnvironmentConfigs.enabled,
      configId: flagEnvironmentConfigs.id,
      configProjectionVersion: flagEnvironmentConfigs.projectionVersion,
      configUpdatedAt: flagEnvironmentConfigs.updatedAt,
      configUpdatedByUserId: flagEnvironmentConfigs.updatedByUserId,
      environmentCreatedAt: environments.createdAt,
      environmentId: environments.id,
      environmentKey: environments.key,
      environmentName: environments.name,
      environmentSortOrder: environments.sortOrder,
    })
    .from(flagEnvironmentConfigs)
    .innerJoin(environments, eq(flagEnvironmentConfigs.environmentId, environments.id))
    .where(eq(flagEnvironmentConfigs.featureFlagId, flagId))
    .orderBy(asc(environments.sortOrder), asc(environments.name));

  const configIds = environmentRows.map((row) => row.configId);
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

  const rulesByConfigId = new Map<string, FlagRuleDetail[]>();

  for (const row of ruleRows) {
    const existing = rulesByConfigId.get(row.flagEnvironmentConfigId) ?? [];

    if (row.ruleType === "attribute_match") {
      if (row.attributeKey === null || row.comparisonValue === null || row.operator === null) {
        throw new Error(`Invalid attribute match rule persisted for flag ${flagId}.`);
      }

      if (row.operator !== "equals" && row.operator !== "in") {
        throw new Error(`Unknown attribute match operator "${row.operator}" for flag ${flagId}.`);
      }

      existing.push({
        attributeKey: row.attributeKey,
        comparisonValue: row.comparisonValue,
        createdAt: row.createdAt,
        id: row.id,
        operator: row.operator,
        rolloutPercentage: null,
        ruleType: row.ruleType,
        sortOrder: row.sortOrder,
        variantKey: row.variantKey,
      });
    } else if (row.ruleType === "percentage_rollout") {
      if (row.rolloutPercentage === null) {
        throw new Error(`Invalid percentage rollout rule persisted for flag ${flagId}.`);
      }

      existing.push({
        attributeKey: null,
        comparisonValue: null,
        createdAt: row.createdAt,
        id: row.id,
        operator: null,
        rolloutPercentage: row.rolloutPercentage,
        ruleType: row.ruleType,
        sortOrder: row.sortOrder,
        variantKey: row.variantKey,
      });
    } else {
      throw new Error(`Unknown rule type "${row.ruleType}" persisted for flag ${flagId}.`);
    }

    rulesByConfigId.set(row.flagEnvironmentConfigId, existing);
  }

  return {
    environments: environmentRows.map((row) => ({
      config: {
        defaultVariantKey: row.configDefaultVariantKey,
        enabled: row.configEnabled,
        id: row.configId,
        projectionVersion: row.configProjectionVersion,
        updatedAt: row.configUpdatedAt,
        updatedByUserId: row.configUpdatedByUserId,
      },
      environment: {
        createdAt: row.environmentCreatedAt,
        id: row.environmentId,
        key: row.environmentKey,
        name: row.environmentName,
        sortOrder: row.environmentSortOrder,
      },
      rules: rulesByConfigId.get(row.configId) ?? [],
    })),
    flag,
    variants,
  };
}
