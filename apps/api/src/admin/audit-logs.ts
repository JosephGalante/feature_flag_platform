import {auditLogs, memberships, users} from "@shared/database";
import type {JsonValue} from "@shared/json";
import {type SQL, and, desc, eq, gte, lte, sql} from "drizzle-orm";
import type {ApiDatabase} from "../lib/database";

type AuditLogEntry = {
  action: string;
  actor: {
    email: string;
    id: string;
    name: string;
  };
  after: JsonValue | null;
  before: JsonValue | null;
  createdAt: Date;
  entityId: string;
  entityType: string;
  environmentId: string | null;
  id: string;
  organizationId: string;
  projectId: string | null;
  requestId: string;
};

type AuditLogPage = {
  auditLogs: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type OrganizationAuditLogInput = {
  createdAfter?: Date;
  createdBefore?: Date;
  entityType?: string;
  environmentId?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  projectId?: string;
};

type EntityAuditLogInput = {
  entityId: string;
  entityType: string;
  page: number;
  pageSize: number;
  userId: string;
};

const auditLogSelection = {
  action: auditLogs.action,
  after: auditLogs.afterJson,
  actorEmail: users.email,
  actorId: users.id,
  actorName: users.name,
  before: auditLogs.beforeJson,
  createdAt: auditLogs.createdAt,
  entityId: auditLogs.entityId,
  entityType: auditLogs.entityType,
  environmentId: auditLogs.environmentId,
  id: auditLogs.id,
  organizationId: auditLogs.organizationId,
  projectId: auditLogs.projectId,
  requestId: auditLogs.requestId,
};

function buildAuditLogConditions(input: {
  createdAfter?: Date;
  createdBefore?: Date;
  entityId?: string;
  entityType?: string;
  environmentId?: string;
  organizationId?: string;
  projectId?: string;
  userId?: string;
}): SQL[] {
  const conditions: SQL[] = [];

  if (input.organizationId) {
    conditions.push(eq(auditLogs.organizationId, input.organizationId));
  }

  if (input.projectId) {
    conditions.push(eq(auditLogs.projectId, input.projectId));
  }

  if (input.environmentId) {
    conditions.push(eq(auditLogs.environmentId, input.environmentId));
  }

  if (input.entityType) {
    conditions.push(eq(auditLogs.entityType, input.entityType));
  }

  if (input.entityId) {
    conditions.push(eq(auditLogs.entityId, input.entityId));
  }

  if (input.createdAfter) {
    conditions.push(gte(auditLogs.createdAt, input.createdAfter));
  }

  if (input.createdBefore) {
    conditions.push(lte(auditLogs.createdAt, input.createdBefore));
  }

  if (input.userId) {
    conditions.push(eq(memberships.userId, input.userId));
  }

  return conditions;
}

function buildAuditLogPage(input: {
  page: number;
  pageSize: number;
  rows: Array<{
    action: string;
    after: JsonValue | null;
    actorEmail: string;
    actorId: string;
    actorName: string;
    before: JsonValue | null;
    createdAt: Date;
    entityId: string;
    entityType: string;
    environmentId: string | null;
    id: string;
    organizationId: string;
    projectId: string | null;
    requestId: string;
  }>;
  total: number;
}): AuditLogPage {
  return {
    auditLogs: input.rows.map((row) => ({
      action: row.action,
      actor: {
        email: row.actorEmail,
        id: row.actorId,
        name: row.actorName,
      },
      after: row.after,
      before: row.before,
      createdAt: row.createdAt,
      entityId: row.entityId,
      entityType: row.entityType,
      environmentId: row.environmentId,
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      requestId: row.requestId,
    })),
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    totalPages: input.total === 0 ? 0 : Math.ceil(input.total / input.pageSize),
  };
}

async function countAuditLogs(db: ApiDatabase, conditions: SQL[]): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(auditLogs)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function listAuditLogsForOrganization(
  db: ApiDatabase,
  input: OrganizationAuditLogInput,
): Promise<AuditLogPage> {
  const conditions = buildAuditLogConditions({
    organizationId: input.organizationId,
    ...(input.createdAfter !== undefined ? {createdAfter: input.createdAfter} : {}),
    ...(input.createdBefore !== undefined ? {createdBefore: input.createdBefore} : {}),
    ...(input.entityType !== undefined ? {entityType: input.entityType} : {}),
    ...(input.environmentId !== undefined ? {environmentId: input.environmentId} : {}),
    ...(input.projectId !== undefined ? {projectId: input.projectId} : {}),
  });
  const total = await countAuditLogs(db, conditions);
  const offset = (input.page - 1) * input.pageSize;
  const rows =
    total === 0
      ? []
      : await db
          .select(auditLogSelection)
          .from(auditLogs)
          .innerJoin(users, eq(auditLogs.actorUserId, users.id))
          .where(and(...conditions))
          .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
          .limit(input.pageSize)
          .offset(offset);

  return buildAuditLogPage({
    page: input.page,
    pageSize: input.pageSize,
    rows,
    total,
  });
}

export async function listAuditLogsForEntity(
  db: ApiDatabase,
  input: EntityAuditLogInput,
): Promise<AuditLogPage | null> {
  const conditions = buildAuditLogConditions({
    entityId: input.entityId,
    entityType: input.entityType,
    userId: input.userId,
  });
  const [countRow] = await db
    .select({
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(auditLogs)
    .innerJoin(memberships, eq(auditLogs.organizationId, memberships.organizationId))
    .where(and(...conditions));
  const total = countRow?.count ?? 0;

  if (total === 0) {
    return null;
  }

  const offset = (input.page - 1) * input.pageSize;
  const rows = await db
    .select(auditLogSelection)
    .from(auditLogs)
    .innerJoin(users, eq(auditLogs.actorUserId, users.id))
    .innerJoin(memberships, eq(auditLogs.organizationId, memberships.organizationId))
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(input.pageSize)
    .offset(offset);

  return buildAuditLogPage({
    page: input.page,
    pageSize: input.pageSize,
    rows,
    total,
  });
}
