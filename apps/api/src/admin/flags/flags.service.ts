import {
  type FeatureFlagStatus,
  type FeatureFlagType,
  type MembershipRole,
  auditLogs,
  environments,
  featureFlags,
  flagEnvironmentConfigs,
  flagRules,
  flagVariants,
  outboxEvents,
} from "@shared/database";
import type {JsonValue} from "@shared/json";
import {asc, eq, inArray, sql} from "drizzle-orm";
import type {ApiDatabase} from "../../lib/database";
import {buildFlagAuditRow, toAuditFlagSnapshot} from "./audit";
import {
  buildEditableConfigurationSnapshot,
  buildRequestedConfigurationSnapshot,
  validateConfigurationInput,
} from "./configurationSnapshot";
import {buildProjectionRefreshEvent} from "./events";
import {flagSummarySelect} from "./readModel";

type ApiTransaction = Parameters<Parameters<ApiDatabase["transaction"]>[0]>[0];

export type ConfigurationRuleType = ConfigurationRuleInput["ruleType"];
export type AttributeMatchOperator = Extract<
  ConfigurationRuleInput,
  {ruleType: "attribute_match"}
>["operator"];

type FlagVariantSeed = {
  description: string;
  key: string;
  value: JsonValue;
};

export type FlagSummary = {
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

export type FlagRuleDetail = {
  attributeKey: string | null;
  comparisonValue: JsonValue | null;
  createdAt: Date;
  id: string;
  operator: AttributeMatchOperator | null;
  rolloutPercentage: number | null;
  ruleType: ConfigurationRuleType;
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

export type FlagDetail = {
  environments: FlagEnvironmentDetail[];
  flag: FlagSummary;
  variants: FlagVariantDetail[];
};

export type AuthorizedFlagAccess = {
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
  action: Extract<FlagAuditAction, "flag.archived" | "flag.updated">;
  actorUserId: string;
  description?: string | null;
  flag: AuthorizedFlagAccess["flag"];
  name?: string;
  requestId: string;
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

export type EditableConfigurationSnapshot = {
  environments: Array<{
    defaultVariantKey: string;
    enabled: boolean;
    environmentId: string;
    rules: Array<{
      attributeKey: string | null;
      comparisonValue: JsonValue | null;
      operator: AttributeMatchOperator | null;
      rolloutPercentage: number | null;
      ruleType: ConfigurationRuleType;
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

export type FlagAuditAction =
  | "flag.created"
  | "flag.updated"
  | "flag.archived"
  | "flag.configuration.updated";

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

function isUniqueViolation(error: unknown): error is {code: string} {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function loadConfigIdByEnvironmentId(
  trx: ApiTransaction,
  featureFlagId: string,
): Promise<Map<string, string>> {
  const configRows = await trx
    .select({
      environmentId: flagEnvironmentConfigs.environmentId,
      id: flagEnvironmentConfigs.id,
    })
    .from(flagEnvironmentConfigs)
    .where(eq(flagEnvironmentConfigs.featureFlagId, featureFlagId));

  return new Map(configRows.map((row) => [row.environmentId, row.id]));
}

async function deleteExistingConfigurationRules(
  trx: ApiTransaction,
  configIds: Iterable<string>,
): Promise<void> {
  const ids = Array.from(configIds);

  if (ids.length === 0) {
    return;
  }

  await trx.delete(flagRules).where(inArray(flagRules.flagEnvironmentConfigId, ids));
}

async function replaceVariants(
  trx: ApiTransaction,
  input: {
    featureFlagId: string;
    variants: ConfigurationVariantInput[];
  },
): Promise<void> {
  await trx.delete(flagVariants).where(eq(flagVariants.featureFlagId, input.featureFlagId));
  await trx.insert(flagVariants).values(
    input.variants.map((variant) => ({
      description: variant.description,
      featureFlagId: input.featureFlagId,
      key: variant.key,
      valueJson: variant.value,
    })),
  );
}

async function replaceEnvironmentConfiguration(
  trx: ApiTransaction,
  input: {
    actorUserId: string;
    configId: string;
    environment: ConfigurationEnvironmentInput;
    now: Date;
  },
): Promise<void> {
  await trx
    .update(flagEnvironmentConfigs)
    .set({
      defaultVariantKey: input.environment.defaultVariantKey,
      enabled: input.environment.enabled,
      projectionVersion: sql`${flagEnvironmentConfigs.projectionVersion} + 1`,
      updatedAt: input.now,
      updatedByUserId: input.actorUserId,
    })
    .where(eq(flagEnvironmentConfigs.id, input.configId));

  if (input.environment.rules.length > 0) {
    await trx.insert(flagRules).values(
      input.environment.rules.map((rule) => ({
        attributeKey: rule.ruleType === "attribute_match" ? rule.attributeKey : null,
        comparisonValueJson: rule.ruleType === "attribute_match" ? rule.comparisonValue : null,
        flagEnvironmentConfigId: input.configId,
        operator: rule.ruleType === "attribute_match" ? rule.operator : null,
        rolloutPercentage: rule.ruleType === "percentage_rollout" ? rule.rolloutPercentage : null,
        ruleType: rule.ruleType,
        sortOrder: rule.sortOrder,
        variantKey: rule.variantKey,
      })),
    );
  }
}

async function touchFlagUpdatedAt(
  trx: ApiTransaction,
  input: {
    featureFlagId: string;
    now: Date;
  },
): Promise<void> {
  const [updatedFlag] = await trx
    .update(featureFlags)
    .set({
      updatedAt: input.now,
    })
    .where(eq(featureFlags.id, input.featureFlagId))
    .returning({id: featureFlags.id});

  if (!updatedFlag) {
    throw new Error(`Failed to update feature flag ${input.featureFlagId}.`);
  }
}

async function writeConfigurationAudit(
  trx: ApiTransaction,
  input: {
    actorUserId: string;
    currentSnapshot: EditableConfigurationSnapshot;
    flag: AuthorizedFlagAccess["flag"];
    requestId: string;
    requestedSnapshot: EditableConfigurationSnapshot;
  },
): Promise<void> {
  await trx.insert(auditLogs).values(
    buildFlagAuditRow({
      action: "flag.configuration.updated",
      actorUserId: input.actorUserId,
      after: input.requestedSnapshot,
      before: input.currentSnapshot,
      flagId: input.flag.id,
      organizationId: input.flag.organizationId,
      projectId: input.flag.projectId,
      requestId: input.requestId,
    }),
  );
}

async function emitConfigurationRefreshEvents(
  trx: ApiTransaction,
  input: {
    actorUserId: string;
    environments: ConfigurationEnvironmentInput[];
    flag: AuthorizedFlagAccess["flag"];
    requestId: string;
  },
): Promise<void> {
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
        .returning(flagSummarySelect);

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
    const now = new Date();
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
        updatedAt: now,
      })
      .where(eq(featureFlags.id, input.flag.id))
      .returning(flagSummarySelect);

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
          updatedAt: now,
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

  validateConfigurationInput({
    environments: input.environments,
    variants: input.variants,
  });

  await db.transaction(async (trx) => {
    const configIdByEnvironmentId = await loadConfigIdByEnvironmentId(trx, input.flag.id);
    const now = new Date();

    await deleteExistingConfigurationRules(trx, configIdByEnvironmentId.values());
    await replaceVariants(trx, {
      featureFlagId: input.flag.id,
      variants: input.variants,
    });

    for (const environment of input.environments) {
      const configId = configIdByEnvironmentId.get(environment.environmentId);

      if (!configId) {
        throw new Error(`Missing environment config for environment ${environment.environmentId}`);
      }

      await replaceEnvironmentConfiguration(trx, {
        actorUserId: input.actorUserId,
        configId,
        environment,
        now,
      });
    }

    await touchFlagUpdatedAt(trx, {
      featureFlagId: input.flag.id,
      now,
    });
    await writeConfigurationAudit(trx, {
      actorUserId: input.actorUserId,
      currentSnapshot,
      flag: input.flag,
      requestId: input.requestId,
      requestedSnapshot,
    });
    await emitConfigurationRefreshEvents(trx, {
      actorUserId: input.actorUserId,
      environments: input.environments,
      flag: input.flag,
      requestId: input.requestId,
    });
  });

  return {changed: true};
}
