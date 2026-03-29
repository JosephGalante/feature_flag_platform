import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {listAuditLogsForEntity, listAuditLogsForOrganization} from "../admin/audit-logs";
import {getOrganizationMembership, requireAuthenticatedAdmin} from "../admin/auth";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";

const organizationParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

const entityParamsSchema = z.object({
  entityId: z.string().uuid(),
  entityType: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z_]+$/),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const organizationAuditQuerySchema = paginationQuerySchema
  .extend({
    createdAfter: z.coerce.date().optional(),
    createdBefore: z.coerce.date().optional(),
    entityType: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z_]+$/)
      .optional(),
    environmentId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      value.createdAfter === undefined ||
      value.createdBefore === undefined ||
      value.createdAfter <= value.createdBefore,
    {
      message: "createdAfter must be less than or equal to createdBefore.",
      path: ["createdAfter"],
    },
  );

export async function registerAdminAuditLogRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.get("/api/admin/organizations/:organizationId/audit-logs", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = organizationParamsSchema.safeParse(request.params);
    const parsedQuery = organizationAuditQuerySchema.safeParse(request.query);

    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          query: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
        },
      });
    }

    const membership = getOrganizationMembership(admin, parsedParams.data.organizationId);

    if (!membership) {
      return reply.code(404).send({
        error: "ORGANIZATION_NOT_FOUND",
        message: "Organization was not found for the current admin.",
      });
    }

    const auditLogPage = await listAuditLogsForOrganization(db, {
      organizationId: parsedParams.data.organizationId,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize,
      ...(parsedQuery.data.createdAfter !== undefined
        ? {createdAfter: parsedQuery.data.createdAfter}
        : {}),
      ...(parsedQuery.data.createdBefore !== undefined
        ? {createdBefore: parsedQuery.data.createdBefore}
        : {}),
      ...(parsedQuery.data.entityType !== undefined
        ? {entityType: parsedQuery.data.entityType}
        : {}),
      ...(parsedQuery.data.environmentId !== undefined
        ? {environmentId: parsedQuery.data.environmentId}
        : {}),
      ...(parsedQuery.data.projectId !== undefined ? {projectId: parsedQuery.data.projectId} : {}),
    });

    return reply.send({
      auditLogs: auditLogPage.auditLogs,
      filters: {
        createdAfter: parsedQuery.data.createdAfter ?? null,
        createdBefore: parsedQuery.data.createdBefore ?? null,
        entityType: parsedQuery.data.entityType ?? null,
        environmentId: parsedQuery.data.environmentId ?? null,
        projectId: parsedQuery.data.projectId ?? null,
      },
      organization: membership,
      pagination: {
        page: auditLogPage.page,
        pageSize: auditLogPage.pageSize,
        total: auditLogPage.total,
        totalPages: auditLogPage.totalPages,
      },
    });
  });

  app.get("/api/admin/entities/:entityType/:entityId/audit-logs", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = entityParamsSchema.safeParse(request.params);
    const parsedQuery = paginationQuerySchema.safeParse(request.query);

    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          query: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
        },
      });
    }

    const auditLogPage = await listAuditLogsForEntity(db, {
      entityId: parsedParams.data.entityId,
      entityType: parsedParams.data.entityType,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.pageSize,
      userId: admin.user.id,
    });

    if (!auditLogPage) {
      return reply.code(404).send({
        error: "ENTITY_NOT_FOUND",
        message: "Audit history was not found for that entity for the current admin.",
      });
    }

    return reply.send({
      auditLogs: auditLogPage.auditLogs,
      entity: {
        entityId: parsedParams.data.entityId,
        entityType: parsedParams.data.entityType,
      },
      pagination: {
        page: auditLogPage.page,
        pageSize: auditLogPage.pageSize,
        total: auditLogPage.total,
        totalPages: auditLogPage.totalPages,
      },
    });
  });
}
