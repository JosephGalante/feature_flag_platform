import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {requireAuthenticatedAdmin, requireOrganizationWriteAccess} from "../admin/auth.js";
import {
  createFlag,
  findAuthorizedFlagAccess,
  getFlagDetail,
  listFlagsForProject,
  updateFlagMetadata,
} from "../admin/flags.js";
import {findAuthorizedProject} from "../admin/service.js";
import type {ApiConfig} from "../config.js";
import type {ApiDatabase} from "../lib/database.js";

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const flagParamsSchema = z.object({
  flagId: z.string().uuid(),
});

const flagListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const createFlagBodySchema = z.object({
  description: z.string().trim().min(1).nullable().optional(),
  flagType: z.enum(["boolean", "variant"]),
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const updateFlagBodySchema = z
  .object({
    description: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.status !== undefined,
    {
      message: "At least one field must be provided.",
      path: ["body"],
    },
  );

function isKnownServiceError(
  error: unknown,
): error is Error & {message: "FLAG_KEY_ALREADY_EXISTS"} {
  return error instanceof Error && error.message === "FLAG_KEY_ALREADY_EXISTS";
}

export async function registerAdminFlagRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.get("/api/admin/projects/:projectId/flags", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = projectParamsSchema.safeParse(request.params);
    const parsedQuery = flagListQuerySchema.safeParse(request.query);

    if (!parsedParams.success || !parsedQuery.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: {
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
          query: parsedQuery.success ? undefined : parsedQuery.error.flatten(),
        },
      });
    }

    const project = await findAuthorizedProject(db, parsedParams.data.projectId, admin.user.id);

    if (!project) {
      return reply.code(404).send({
        error: "PROJECT_NOT_FOUND",
        message: "Project was not found for the current admin.",
      });
    }

    const flags = await listFlagsForProject(db, {
      projectId: project.id,
      ...(parsedQuery.data.search !== undefined ? {search: parsedQuery.data.search} : {}),
      ...(parsedQuery.data.status !== undefined ? {status: parsedQuery.data.status} : {}),
    });

    return reply.send({
      flags,
      project,
    });
  });

  app.post("/api/admin/projects/:projectId/flags", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = projectParamsSchema.safeParse(request.params);
    const parsedBody = createFlagBodySchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: {
          body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
        },
      });
    }

    const project = await findAuthorizedProject(db, parsedParams.data.projectId, admin.user.id);

    if (!project) {
      return reply.code(404).send({
        error: "PROJECT_NOT_FOUND",
        message: "Project was not found for the current admin.",
      });
    }

    const hasWriteAccess = await requireOrganizationWriteAccess(
      admin,
      project.organizationId,
      reply,
    );

    if (!hasWriteAccess) {
      return;
    }

    try {
      const flag = await createFlag(db, {
        actorUserId: admin.user.id,
        description: parsedBody.data.description ?? null,
        flagType: parsedBody.data.flagType,
        key: parsedBody.data.key,
        name: parsedBody.data.name,
        organizationId: project.organizationId,
        projectId: project.id,
        requestId: request.id,
      });

      return reply.code(201).send({
        flag,
      });
    } catch (error) {
      if (isKnownServiceError(error)) {
        return reply.code(409).send({
          error: error.message,
          message: "A feature flag with this key already exists in the project.",
        });
      }

      throw error;
    }
  });

  app.get("/api/admin/flags/:flagId", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = flagParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const access = await findAuthorizedFlagAccess(db, parsedParams.data.flagId, admin.user.id);

    if (!access) {
      return reply.code(404).send({
        error: "FLAG_NOT_FOUND",
        message: "Feature flag was not found for the current admin.",
      });
    }

    const detail = await getFlagDetail(db, access.flag.id);

    if (!detail) {
      return reply.code(404).send({
        error: "FLAG_NOT_FOUND",
        message: "Feature flag detail is unavailable.",
      });
    }

    return reply.send(detail);
  });

  app.patch("/api/admin/flags/:flagId", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = flagParamsSchema.safeParse(request.params);
    const parsedBody = updateFlagBodySchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: {
          body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
        },
      });
    }

    const access = await findAuthorizedFlagAccess(db, parsedParams.data.flagId, admin.user.id);

    if (!access) {
      return reply.code(404).send({
        error: "FLAG_NOT_FOUND",
        message: "Feature flag was not found for the current admin.",
      });
    }

    const hasWriteAccess = await requireOrganizationWriteAccess(
      admin,
      access.flag.organizationId,
      reply,
    );

    if (!hasWriteAccess) {
      return;
    }

    const nextAction =
      parsedBody.data.status === "archived" && access.flag.status !== "archived"
        ? "flag.archived"
        : "flag.updated";

    const flag = await updateFlagMetadata(db, {
      action: nextAction,
      actorUserId: admin.user.id,
      flag: access.flag,
      requestId: request.id,
      ...(parsedBody.data.description !== undefined
        ? {description: parsedBody.data.description}
        : {}),
      ...(parsedBody.data.name !== undefined ? {name: parsedBody.data.name} : {}),
      ...(parsedBody.data.status !== undefined ? {status: parsedBody.data.status} : {}),
    });

    return reply.send({
      flag,
    });
  });

  app.post("/api/admin/flags/:flagId/archive", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = flagParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const access = await findAuthorizedFlagAccess(db, parsedParams.data.flagId, admin.user.id);

    if (!access) {
      return reply.code(404).send({
        error: "FLAG_NOT_FOUND",
        message: "Feature flag was not found for the current admin.",
      });
    }

    const hasWriteAccess = await requireOrganizationWriteAccess(
      admin,
      access.flag.organizationId,
      reply,
    );

    if (!hasWriteAccess) {
      return;
    }

    const flag = await updateFlagMetadata(db, {
      action: "flag.archived",
      actorUserId: admin.user.id,
      flag: access.flag,
      requestId: request.id,
      status: "archived",
    });

    return reply.send({
      flag,
    });
  });
}
