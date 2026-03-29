import {
  type ApiKeyStatus,
  type MembershipRole,
  type NewAuditLog,
  apiKeys,
  auditLogs,
  environments,
  memberships,
  projects,
} from "@shared/database";
import type {JsonValue} from "@shared/json";
import {and, asc, desc, eq} from "drizzle-orm";
import {generateApiKey} from "../lib/api-keys";
import type {ApiDatabase} from "../lib/database";

export type ApiKeySummary = {
  createdAt: Date;
  environmentId: string;
  id: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  name: string;
  organizationId: string;
  projectId: string;
  revokedAt: Date | null;
  status: ApiKeyStatus;
};

type EnvironmentAccess = {
  environment: {
    createdAt: Date;
    id: string;
    key: string;
    name: string;
    organizationId: string;
    projectId: string;
    sortOrder: number;
  };
  role: MembershipRole;
};

type ApiKeyAccess = {
  apiKey: ApiKeySummary;
  role: MembershipRole;
};

type CreateApiKeyInput = {
  actorUserId: string;
  environment: EnvironmentAccess["environment"];
  name: string;
  requestId: string;
};

type RevokeApiKeyInput = {
  actorUserId: string;
  apiKey: ApiKeySummary;
  requestId: string;
};

function toApiKeyAuditSnapshot(apiKey: ApiKeySummary): JsonValue {
  return {
    createdAt: apiKey.createdAt.toISOString(),
    environmentId: apiKey.environmentId,
    id: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    name: apiKey.name,
    organizationId: apiKey.organizationId,
    projectId: apiKey.projectId,
    revokedAt: apiKey.revokedAt?.toISOString() ?? null,
    status: apiKey.status,
  };
}

function buildApiKeyAuditRow(input: {
  action: "api_key.created" | "api_key.revoked";
  actorUserId: string;
  after: JsonValue | null;
  before: JsonValue | null;
  entityId: string;
  environmentId: string;
  organizationId: string;
  projectId: string;
  requestId: string;
}): NewAuditLog {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    afterJson: input.after,
    beforeJson: input.before,
    entityId: input.entityId,
    entityType: "api_key",
    environmentId: input.environmentId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  };
}

export async function findAuthorizedEnvironmentAccess(
  db: ApiDatabase,
  environmentId: string,
  userId: string,
): Promise<EnvironmentAccess | null> {
  const [environment] = await db
    .select({
      createdAt: environments.createdAt,
      id: environments.id,
      key: environments.key,
      name: environments.name,
      organizationId: projects.organizationId,
      projectId: environments.projectId,
      role: memberships.role,
      sortOrder: environments.sortOrder,
    })
    .from(environments)
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .innerJoin(memberships, eq(projects.organizationId, memberships.organizationId))
    .where(and(eq(environments.id, environmentId), eq(memberships.userId, userId)))
    .limit(1);

  if (!environment) {
    return null;
  }

  return {
    environment: {
      createdAt: environment.createdAt,
      id: environment.id,
      key: environment.key,
      name: environment.name,
      organizationId: environment.organizationId,
      projectId: environment.projectId,
      sortOrder: environment.sortOrder,
    },
    role: environment.role,
  };
}

export async function listApiKeysForEnvironment(
  db: ApiDatabase,
  environmentId: string,
): Promise<ApiKeySummary[]> {
  return db
    .select({
      createdAt: apiKeys.createdAt,
      environmentId: apiKeys.environmentId,
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      name: apiKeys.name,
      organizationId: projects.organizationId,
      projectId: environments.projectId,
      revokedAt: apiKeys.revokedAt,
      status: apiKeys.status,
    })
    .from(apiKeys)
    .innerJoin(environments, eq(apiKeys.environmentId, environments.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .where(eq(apiKeys.environmentId, environmentId))
    .orderBy(desc(apiKeys.createdAt), asc(apiKeys.name));
}

export async function createApiKey(
  db: ApiDatabase,
  input: CreateApiKeyInput,
): Promise<{apiKey: ApiKeySummary; rawKey: string}> {
  const generatedKey = generateApiKey();

  return db.transaction(async (trx) => {
    const [apiKey] = await trx
      .insert(apiKeys)
      .values({
        environmentId: input.environment.id,
        keyHash: generatedKey.keyHash,
        keyPrefix: generatedKey.keyPrefix,
        name: input.name,
        status: "active",
      })
      .returning({
        createdAt: apiKeys.createdAt,
        environmentId: apiKeys.environmentId,
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        name: apiKeys.name,
        revokedAt: apiKeys.revokedAt,
        status: apiKeys.status,
      });

    if (!apiKey) {
      throw new Error("API_KEY_CREATE_FAILED");
    }

    const summary: ApiKeySummary = {
      ...apiKey,
      organizationId: input.environment.organizationId,
      projectId: input.environment.projectId,
    };

    await trx.insert(auditLogs).values(
      buildApiKeyAuditRow({
        action: "api_key.created",
        actorUserId: input.actorUserId,
        after: toApiKeyAuditSnapshot(summary),
        before: null,
        entityId: summary.id,
        environmentId: summary.environmentId,
        organizationId: summary.organizationId,
        projectId: summary.projectId,
        requestId: input.requestId,
      }),
    );

    return {
      apiKey: summary,
      rawKey: generatedKey.rawKey,
    };
  });
}

export async function findAuthorizedApiKeyAccess(
  db: ApiDatabase,
  apiKeyId: string,
  userId: string,
): Promise<ApiKeyAccess | null> {
  const [apiKey] = await db
    .select({
      createdAt: apiKeys.createdAt,
      environmentId: apiKeys.environmentId,
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      lastUsedAt: apiKeys.lastUsedAt,
      name: apiKeys.name,
      organizationId: projects.organizationId,
      projectId: environments.projectId,
      revokedAt: apiKeys.revokedAt,
      role: memberships.role,
      status: apiKeys.status,
    })
    .from(apiKeys)
    .innerJoin(environments, eq(apiKeys.environmentId, environments.id))
    .innerJoin(projects, eq(environments.projectId, projects.id))
    .innerJoin(memberships, eq(projects.organizationId, memberships.organizationId))
    .where(and(eq(apiKeys.id, apiKeyId), eq(memberships.userId, userId)))
    .limit(1);

  if (!apiKey) {
    return null;
  }

  return {
    apiKey: {
      createdAt: apiKey.createdAt,
      environmentId: apiKey.environmentId,
      id: apiKey.id,
      keyPrefix: apiKey.keyPrefix,
      lastUsedAt: apiKey.lastUsedAt,
      name: apiKey.name,
      organizationId: apiKey.organizationId,
      projectId: apiKey.projectId,
      revokedAt: apiKey.revokedAt,
      status: apiKey.status,
    },
    role: apiKey.role,
  };
}

export async function revokeApiKey(
  db: ApiDatabase,
  input: RevokeApiKeyInput,
): Promise<ApiKeySummary> {
  if (input.apiKey.status === "revoked") {
    return input.apiKey;
  }

  return db.transaction(async (trx) => {
    const [updatedApiKey] = await trx
      .update(apiKeys)
      .set({
        revokedAt: new Date(),
        status: "revoked",
      })
      .where(eq(apiKeys.id, input.apiKey.id))
      .returning({
        createdAt: apiKeys.createdAt,
        environmentId: apiKeys.environmentId,
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        lastUsedAt: apiKeys.lastUsedAt,
        name: apiKeys.name,
        revokedAt: apiKeys.revokedAt,
        status: apiKeys.status,
      });

    if (!updatedApiKey) {
      throw new Error("API_KEY_REVOKE_FAILED");
    }

    const summary: ApiKeySummary = {
      ...updatedApiKey,
      organizationId: input.apiKey.organizationId,
      projectId: input.apiKey.projectId,
    };

    await trx.insert(auditLogs).values(
      buildApiKeyAuditRow({
        action: "api_key.revoked",
        actorUserId: input.actorUserId,
        after: toApiKeyAuditSnapshot(summary),
        before: toApiKeyAuditSnapshot(input.apiKey),
        entityId: summary.id,
        environmentId: summary.environmentId,
        organizationId: summary.organizationId,
        projectId: summary.projectId,
        requestId: input.requestId,
      }),
    );

    return summary;
  });
}
