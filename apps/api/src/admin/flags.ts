import {
  type FeatureFlagStatus,
  type FeatureFlagType,
  type MembershipRole,
  type NewAuditLog,
  auditLogs,
  environments,
  featureFlags,
  flagEnvironmentConfigs,
  flagRules,
  flagVariants,
  memberships,
  outboxEvents,
  projects,
} from "@shared/database";
import type {JsonValue} from "@shared/json";
import {type SQL, and, asc, desc, eq, ilike, inArray, or, sql} from "drizzle-orm";
import type {ApiDatabase} from "../lib/database";

type FlagVariantSeed = {
  description: string;
  key: string;
  value: JsonValue;
};

type FlagSummary = {
  createdAt: Date;
  createdByUserId: string;
  description: string | null;
  flagType: FeatureFlagType;
  id: string;
  key: string;
  name: string;
  organizationId: string;
  projectId: string;
  status: FeatureFlagStatus;
  updatedAt: Date;
};

type FlagVariantDetail = {
  description: string | null;
  id: string;
  key: string;
  value: JsonValue;
};

type FlagRuleDetail = {
  attributeKey: string | null;
  comparisonValue: JsonValue | null;
  createdAt: Date;
  id: string;
  operator: string | null;
  rolloutPercentage: number | null;
  ruleType: string;
  sortOrder: number;
  variantKey: string;
};

type FlagEnvironmentDetail = {
  config: {
    defaultVariantKey: string;
    enabled: boolean;
    id: string;
    projectionVersion: number;
    updatedAt: Date;
    updatedByUserId: string;
  };
  environment: {
    createdAt: Date;
    id: string;
    key: string;
    name: string;
    sortOrder: number;
  };
  rules: FlagRuleDetail[];
};

type FlagDetail = {
  environments: FlagEnvironmentDetail[];
  flag: FlagSummary;
  variants: FlagVariantDetail[];
};

type AuthorizedFlagAccess = {
  flag: FlagSummary;
  role: MembershipRole;
};

export type ConfigurationVariantInput = {
  description: string | null;
  key: string;
  value: JsonValue;
};

export type ConfigurationRuleInput =
  | {
      attributeKey: string;
      comparisonValue: JsonValue;
      operator: "equals" | "in";
      ruleType: "attribute_match";
      rolloutPercentage?: never;
      sortOrder: number;
      variantKey: string;
    }
  | {
      attributeKey?: never;
      comparisonValue?: never;
      operator?: never;
      ruleType: "percentage_rollout";
      rolloutPercentage: number;
      sortOrder: number;
      variantKey: string;
    };

export type ConfigurationEnvironmentInput = {
  defaultVariantKey: string;
  enabled: boolean;
  environmentId: string;
  rules: ConfigurationRuleInput[];
};

type CreateFlagInput = {
  actorUserId: string;
  description: string | null;
  flagType: FeatureFlagType;
  key: string;
  name: string;
  organizationId: string;
  projectId: string;
  requestId: string;
};

type UpdateFlagInput = {
  action: "flag.archived" | "flag.updated";
  actorUserId: string;
  description?: string | null;
  flag: AuthorizedFlagAccess["flag"];
  name?: string;
  requestId: string;
  status?: FeatureFlagStatus;
};

type ListProjectFlagsInput = {
  projectId: string;
  search?: string;
  status?: FeatureFlagStatus;
};

type ReplaceFlagConfigurationInput = {
  actorUserId: string;
  currentDetail: FlagDetail;
  environments: ConfigurationEnvironmentInput[];
  flag: AuthorizedFlagAccess["flag"];
  requestId: string;
  variants: ConfigurationVariantInput[];
};

type EditableConfigurationSnapshot = {
  environments: Array<{
    defaultVariantKey: string;
    enabled: boolean;
    environmentId: string;
    rules: Array<{
      attributeKey: string | null;
      comparisonValue: JsonValue | null;
      operator: string | null;
      rolloutPercentage: number | null;
      ruleType: string;
      sortOrder: number;
      variantKey: string;
    }>;
  }>;
  variants: Array<{
    description: string | null;
    key: string;
    value: JsonValue;
  }>;
};

function buildDefaultVariants(flagType: FeatureFlagType): {
  defaultVariantKey: string;
  variants: FlagVariantSeed[];
} {
  if (flagType === "boolean") {
    return {
      defaultVariantKey: "off",
      variants: [
        {
          description: "Enabled",
          key: "on",
          value: true,
        },
        {
          description: "Disabled",
          key: "off",
          value: false,
        },
      ],
    };
  }

  return {
    defaultVariantKey: "control",
    variants: [
      {
        description: "Control",
        key: "control",
        value: "control",
      },
      {
        description: "Treatment",
        key: "treatment",
        value: "treatment",
      },
    ],
  };
}

function buildProjectionRefreshEvent(input: {
  actorUserId: string;
  environmentId: string;
  featureFlagId: string;
  organizationId: string;
  projectId: string;
  reason: string;
  requestId: string;
}) {
  return {
    aggregateId: input.environmentId,
    aggregateType: "environment",
    eventType: "flag_projection_refresh_requested",
    idempotencyKey: `${input.requestId}:${input.featureFlagId}:${input.environmentId}:${input.reason}`,
    payloadJson: {
      environmentId: input.environmentId,
      featureFlagId: input.featureFlagId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      reason: input.reason,
      triggeredByUserId: input.actorUserId,
    } satisfies JsonValue,
    status: "pending" as const,
  };
}

function buildFlagAuditRow(input: {
  action: string;
  actorUserId: string;
  after: JsonValue | null;
  before: JsonValue | null;
  flagId: string;
  organizationId: string;
  projectId: string;
  requestId: string;
}): NewAuditLog {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    afterJson: input.after,
    beforeJson: input.before,
    entityId: input.flagId,
    entityType: "feature_flag",
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  };
}

function toAuditFlagSnapshot(flag: FlagSummary): JsonValue {
  return {
    createdAt: flag.createdAt.toISOString(),
    createdByUserId: flag.createdByUserId,
    description: flag.description,
    flagType: flag.flagType,
    id: flag.id,
    key: flag.key,
    name: flag.name,
    organizationId: flag.organizationId,
    projectId: flag.projectId,
    status: flag.status,
    updatedAt: flag.updatedAt.toISOString(),
  };
}

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

function buildEditableConfigurationSnapshot(detail: FlagDetail): EditableConfigurationSnapshot {
  return {
    environments: detail.environments
      .map((environment) => ({
        defaultVariantKey: environment.config.defaultVariantKey,
        enabled: environment.config.enabled,
        environmentId: environment.environment.id,
        rules: environment.rules
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
          .sort((left, right) => left.sortOrder - right.sortOrder),
      }))
      .sort((left, right) => left.environmentId.localeCompare(right.environmentId)),
    variants: detail.variants
      .map((variant) => ({
        description: variant.description,
        key: variant.key,
        value: normalizeJsonValue(variant.value),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function buildRequestedConfigurationSnapshot(input: {
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
}): EditableConfigurationSnapshot {
  return {
    environments: input.environments
      .map((environment) => ({
        defaultVariantKey: environment.defaultVariantKey,
        enabled: environment.enabled,
        environmentId: environment.environmentId,
        rules: environment.rules
          .map((rule) => ({
            attributeKey: rule.ruleType === "attribute_match" ? rule.attributeKey : null,
            comparisonValue:
              rule.ruleType === "attribute_match" ? normalizeJsonValue(rule.comparisonValue) : null,
            operator: rule.ruleType === "attribute_match" ? rule.operator : null,
            rolloutPercentage:
              rule.ruleType === "percentage_rollout" ? rule.rolloutPercentage : null,
            ruleType: rule.ruleType,
            sortOrder: rule.sortOrder,
            variantKey: rule.variantKey,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder),
      }))
      .sort((left, right) => left.environmentId.localeCompare(right.environmentId)),
    variants: input.variants
      .map((variant) => ({
        description: variant.description,
        key: variant.key,
        value: normalizeJsonValue(variant.value),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function isUniqueViolation(error: unknown): error is {code: string} {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function selectFlagSummary(db: ApiDatabase, flagId: string): Promise<FlagSummary | null> {
  const [flag] = await db
    .select({
      createdAt: featureFlags.createdAt,
      createdByUserId: featureFlags.createdByUserId,
      description: featureFlags.description,
      flagType: featureFlags.flagType,
      id: featureFlags.id,
      key: featureFlags.key,
      name: featureFlags.name,
      organizationId: projects.organizationId,
      projectId: featureFlags.projectId,
      status: featureFlags.status,
      updatedAt: featureFlags.updatedAt,
    })
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
    .select({
      createdAt: featureFlags.createdAt,
      createdByUserId: featureFlags.createdByUserId,
      description: featureFlags.description,
      flagType: featureFlags.flagType,
      id: featureFlags.id,
      key: featureFlags.key,
      name: featureFlags.name,
      organizationId: projects.organizationId,
      projectId: featureFlags.projectId,
      status: featureFlags.status,
      updatedAt: featureFlags.updatedAt,
    })
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
    .select({
      createdAt: featureFlags.createdAt,
      createdByUserId: featureFlags.createdByUserId,
      description: featureFlags.description,
      flagType: featureFlags.flagType,
      id: featureFlags.id,
      key: featureFlags.key,
      name: featureFlags.name,
      organizationId: projects.organizationId,
      projectId: featureFlags.projectId,
      role: memberships.role,
      status: featureFlags.status,
      updatedAt: featureFlags.updatedAt,
    })
    .from(featureFlags)
    .innerJoin(projects, eq(featureFlags.projectId, projects.id))
    .innerJoin(memberships, eq(projects.organizationId, memberships.organizationId))
    .where(and(eq(featureFlags.id, flagId), eq(memberships.userId, userId)))
    .limit(1);

  if (!flag) {
    return null;
  }

  return {
    flag: {
      createdAt: flag.createdAt,
      createdByUserId: flag.createdByUserId,
      description: flag.description,
      flagType: flag.flagType,
      id: flag.id,
      key: flag.key,
      name: flag.name,
      organizationId: flag.organizationId,
      projectId: flag.projectId,
      status: flag.status,
      updatedAt: flag.updatedAt,
    },
    role: flag.role,
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

export async function createFlag(db: ApiDatabase, input: CreateFlagInput): Promise<FlagSummary> {
  try {
    return await db.transaction(async (trx) => {
      const environmentsForProject = await trx
        .select({
          environmentId: environments.id,
        })
        .from(environments)
        .where(eq(environments.projectId, input.projectId))
        .orderBy(asc(environments.sortOrder), asc(environments.name));

      const defaultVariants = buildDefaultVariants(input.flagType);
      const [flag] = await trx
        .insert(featureFlags)
        .values({
          createdByUserId: input.actorUserId,
          description: input.description,
          flagType: input.flagType,
          key: input.key,
          name: input.name,
          projectId: input.projectId,
          status: "active",
        })
        .returning({
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
        });

      if (!flag) {
        throw new Error("Failed to create feature flag.");
      }

      await trx.insert(flagVariants).values(
        defaultVariants.variants.map((variant) => ({
          description: variant.description,
          featureFlagId: flag.id,
          key: variant.key,
          valueJson: variant.value,
        })),
      );

      if (environmentsForProject.length > 0) {
        await trx.insert(flagEnvironmentConfigs).values(
          environmentsForProject.map((environment) => ({
            defaultVariantKey: defaultVariants.defaultVariantKey,
            enabled: false,
            environmentId: environment.environmentId,
            featureFlagId: flag.id,
            projectionVersion: 1,
            updatedByUserId: input.actorUserId,
          })),
        );

        await trx.insert(outboxEvents).values(
          environmentsForProject.map((environment) =>
            buildProjectionRefreshEvent({
              actorUserId: input.actorUserId,
              environmentId: environment.environmentId,
              featureFlagId: flag.id,
              organizationId: input.organizationId,
              projectId: input.projectId,
              reason: "flag.created",
              requestId: input.requestId,
            }),
          ),
        );
      }

      const flagSummary: FlagSummary = {
        ...flag,
        organizationId: input.organizationId,
      };

      await trx.insert(auditLogs).values(
        buildFlagAuditRow({
          action: "flag.created",
          actorUserId: input.actorUserId,
          after: toAuditFlagSnapshot(flagSummary),
          before: null,
          flagId: flag.id,
          organizationId: input.organizationId,
          projectId: input.projectId,
          requestId: input.requestId,
        }),
      );

      return flagSummary;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("FLAG_KEY_ALREADY_EXISTS");
    }

    throw error;
  }
}

export async function updateFlagMetadata(
  db: ApiDatabase,
  input: UpdateFlagInput,
): Promise<FlagSummary> {
  return db.transaction(async (trx) => {
    const nextName = input.name ?? input.flag.name;
    const nextDescription =
      input.description === undefined ? input.flag.description : input.description;
    const nextStatus = input.status ?? input.flag.status;
    const statusChanged = nextStatus !== input.flag.status;
    const nameChanged = nextName !== input.flag.name;
    const descriptionChanged = nextDescription !== input.flag.description;

    if (!statusChanged && !nameChanged && !descriptionChanged) {
      return input.flag;
    }

    const [updatedFlag] = await trx
      .update(featureFlags)
      .set({
        description: nextDescription,
        name: nextName,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(featureFlags.id, input.flag.id))
      .returning({
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
      });

    if (!updatedFlag) {
      throw new Error("Failed to update feature flag.");
    }

    if (statusChanged) {
      const affectedConfigs = await trx
        .select({
          environmentId: flagEnvironmentConfigs.environmentId,
        })
        .from(flagEnvironmentConfigs)
        .where(eq(flagEnvironmentConfigs.featureFlagId, input.flag.id));

      await trx
        .update(flagEnvironmentConfigs)
        .set({
          projectionVersion: sql`${flagEnvironmentConfigs.projectionVersion} + 1`,
          updatedAt: new Date(),
          updatedByUserId: input.actorUserId,
        })
        .where(eq(flagEnvironmentConfigs.featureFlagId, input.flag.id));

      if (affectedConfigs.length > 0) {
        await trx.insert(outboxEvents).values(
          affectedConfigs.map((config) =>
            buildProjectionRefreshEvent({
              actorUserId: input.actorUserId,
              environmentId: config.environmentId,
              featureFlagId: input.flag.id,
              organizationId: input.flag.organizationId,
              projectId: input.flag.projectId,
              reason: input.action,
              requestId: input.requestId,
            }),
          ),
        );
      }
    }

    const updatedSummary: FlagSummary = {
      ...updatedFlag,
      organizationId: input.flag.organizationId,
    };

    await trx.insert(auditLogs).values(
      buildFlagAuditRow({
        action: input.action,
        actorUserId: input.actorUserId,
        after: toAuditFlagSnapshot(updatedSummary),
        before: toAuditFlagSnapshot(input.flag),
        flagId: input.flag.id,
        organizationId: input.flag.organizationId,
        projectId: input.flag.projectId,
        requestId: input.requestId,
      }),
    );

    return updatedSummary;
  });
}

export async function replaceFlagConfiguration(
  db: ApiDatabase,
  input: ReplaceFlagConfigurationInput,
): Promise<{changed: boolean}> {
  const currentSnapshot = buildEditableConfigurationSnapshot(input.currentDetail);
  const requestedSnapshot = buildRequestedConfigurationSnapshot({
    environments: input.environments,
    variants: input.variants,
  });

  if (JSON.stringify(currentSnapshot) === JSON.stringify(requestedSnapshot)) {
    return {changed: false};
  }

  await db.transaction(async (trx) => {
    const configRows = await trx
      .select({
        environmentId: flagEnvironmentConfigs.environmentId,
        id: flagEnvironmentConfigs.id,
      })
      .from(flagEnvironmentConfigs)
      .where(eq(flagEnvironmentConfigs.featureFlagId, input.flag.id));

    const configIdByEnvironmentId = new Map(
      configRows.map((row) => [row.environmentId, row.id] as const),
    );
    const now = new Date();

    await trx.delete(flagRules).where(
      inArray(
        flagRules.flagEnvironmentConfigId,
        configRows.map((row) => row.id),
      ),
    );
    await trx.delete(flagVariants).where(eq(flagVariants.featureFlagId, input.flag.id));

    await trx.insert(flagVariants).values(
      input.variants.map((variant) => ({
        description: variant.description,
        featureFlagId: input.flag.id,
        key: variant.key,
        valueJson: variant.value,
      })),
    );

    for (const environment of input.environments) {
      const configId = configIdByEnvironmentId.get(environment.environmentId);

      if (!configId) {
        throw new Error(`Missing environment config for environment ${environment.environmentId}`);
      }

      await trx
        .update(flagEnvironmentConfigs)
        .set({
          defaultVariantKey: environment.defaultVariantKey,
          enabled: environment.enabled,
          projectionVersion: sql`${flagEnvironmentConfigs.projectionVersion} + 1`,
          updatedAt: now,
          updatedByUserId: input.actorUserId,
        })
        .where(eq(flagEnvironmentConfigs.id, configId));

      if (environment.rules.length > 0) {
        await trx.insert(flagRules).values(
          environment.rules.map((rule) => ({
            attributeKey: rule.ruleType === "attribute_match" ? rule.attributeKey : null,
            comparisonValueJson: rule.ruleType === "attribute_match" ? rule.comparisonValue : null,
            flagEnvironmentConfigId: configId,
            operator: rule.ruleType === "attribute_match" ? rule.operator : null,
            rolloutPercentage:
              rule.ruleType === "percentage_rollout" ? rule.rolloutPercentage : null,
            ruleType: rule.ruleType,
            sortOrder: rule.sortOrder,
            variantKey: rule.variantKey,
          })),
        );
      }
    }

    await trx
      .update(featureFlags)
      .set({
        updatedAt: now,
      })
      .where(eq(featureFlags.id, input.flag.id))
      .returning({
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
      });

    await trx.insert(auditLogs).values({
      action: "flag.configuration.updated",
      actorUserId: input.actorUserId,
      afterJson: requestedSnapshot,
      beforeJson: currentSnapshot,
      entityId: input.flag.id,
      entityType: "feature_flag",
      organizationId: input.flag.organizationId,
      projectId: input.flag.projectId,
      requestId: input.requestId,
    });

    await trx.insert(outboxEvents).values(
      input.environments.map((environment) =>
        buildProjectionRefreshEvent({
          actorUserId: input.actorUserId,
          environmentId: environment.environmentId,
          featureFlagId: input.flag.id,
          organizationId: input.flag.organizationId,
          projectId: input.flag.projectId,
          reason: "flag.configuration.updated",
          requestId: input.requestId,
        }),
      ),
    );
  });

  return {changed: true};
}
