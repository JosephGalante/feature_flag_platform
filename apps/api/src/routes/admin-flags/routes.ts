import {requireAuthenticatedAdmin, requireOrganizationWriteAccess} from "@api/admin/auth";
import {createFlag, replaceFlagConfiguration, updateFlagMetadata} from "@api/admin/flags";
import {
  findAuthorizedFlagAccess,
  getFlagDetail,
  listFlagsForProject,
} from "@api/admin/flags/readModel";
import {findAuthorizedProject, listEnvironmentsForProject} from "@api/admin/service";
import type {ApiConfig} from "@api/config";
import type {ApiDatabase} from "@api/lib/database";
import {publishProjectionRefreshJobs} from "@api/lib/qstash";
import {readEnvironmentProjection} from "@api/lib/redis-projections";
import {previewFlagEvaluation} from "@api/projections/preview-flag-evaluation";
import type {EvaluationContext} from "@feature-flag-platform/evaluation-core";
import type {FastifyInstance} from "fastify";
import {toConfigurationInputs, validateConfigurationPayload} from "./payloads";
import {
  configurationBodySchema,
  createFlagBodySchema,
  flagListQuerySchema,
  flagParamsSchema,
  previewBodySchema,
  projectParamsSchema,
  updateFlagBodySchema,
} from "./schemas";

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
  const projectionRefreshMode = config.qstash ? "qstash" : "outbox";

  app.get("/api/admin/projects/:projectId/flags", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) return;

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

    if (!admin) return;

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
      const result = await createFlag(db, {
        actorUserId: admin.user.id,
        description: parsedBody.data.description ?? null,
        flagType: parsedBody.data.flagType,
        key: parsedBody.data.key,
        name: parsedBody.data.name,
        organizationId: project.organizationId,
        projectId: project.id,
        projectionRefreshMode,
        requestId: request.id,
      });

      if (config.qstash) {
        await publishProjectionRefreshJobs(config.qstash, result.projectionRefreshJobs);
      }

      return reply.code(201).send({
        flag: result.flag,
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

    if (!admin) return;

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

  app.post("/api/admin/flags/:flagId/preview", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) return;

    const parsedParams = flagParamsSchema.safeParse(request.params);
    const parsedBody = previewBodySchema.safeParse(request.body);

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

    const environments = await listEnvironmentsForProject(db, access.flag.projectId);
    const hasEnvironment = environments.some(
      (environment) => environment.id === parsedBody.data.environmentId,
    );

    if (!hasEnvironment) {
      return reply.code(404).send({
        error: "ENVIRONMENT_NOT_FOUND",
        message: "Environment does not belong to the feature flag's project.",
      });
    }

    const result = await previewFlagEvaluation(
      {
        readProjection: async (environmentId) =>
          await readEnvironmentProjection(config.redisUrl, environmentId),
      },
      {
        context: parsedBody.data.context satisfies EvaluationContext,
        environmentId: parsedBody.data.environmentId,
        flagKey: access.flag.key,
      },
    );

    if (result.status === "projection_not_found") {
      return reply.code(503).send({
        error: "PROJECTION_NOT_READY",
        message: "No Redis projection exists for that environment.",
      });
    }

    return reply.send(result.result);
  });

  app.patch("/api/admin/flags/:flagId", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) return;

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

    const result = await updateFlagMetadata(db, {
      action: nextAction,
      actorUserId: admin.user.id,
      flag: access.flag,
      projectionRefreshMode,
      requestId: request.id,
      ...(parsedBody.data.description !== undefined
        ? {description: parsedBody.data.description}
        : {}),
      ...(parsedBody.data.name !== undefined ? {name: parsedBody.data.name} : {}),
      ...(parsedBody.data.status !== undefined ? {status: parsedBody.data.status} : {}),
    });

    if (config.qstash) {
      await publishProjectionRefreshJobs(config.qstash, result.projectionRefreshJobs);
    }

    return reply.send({
      flag: result.flag,
    });
  });

  app.post("/api/admin/flags/:flagId/archive", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) return;

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

    const result = await updateFlagMetadata(db, {
      action: "flag.archived",
      actorUserId: admin.user.id,
      flag: access.flag,
      projectionRefreshMode,
      requestId: request.id,
      status: "archived",
    });

    if (config.qstash) {
      await publishProjectionRefreshJobs(config.qstash, result.projectionRefreshJobs);
    }

    return reply.send({
      flag: result.flag,
    });
  });

  app.put("/api/admin/flags/:flagId/configuration", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) return;

    const parsedParams = flagParamsSchema.safeParse(request.params);
    const parsedBody = configurationBodySchema.safeParse(request.body);

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

    const currentDetail = await getFlagDetail(db, access.flag.id);

    if (!currentDetail) {
      return reply.code(404).send({
        error: "FLAG_NOT_FOUND",
        message: "Feature flag detail is unavailable.",
      });
    }

    const {environments, variants} = toConfigurationInputs(parsedBody.data);
    const validationIssues = validateConfigurationPayload({
      currentDetail,
      environments,
      variants,
    });

    if (validationIssues.length > 0) {
      return reply.code(400).send({
        error: "INVALID_CONFIGURATION",
        issues: validationIssues,
      });
    }

    const result = await replaceFlagConfiguration(db, {
      actorUserId: admin.user.id,
      currentDetail,
      environments,
      flag: access.flag,
      projectionRefreshMode,
      requestId: request.id,
      variants,
    });

    if (config.qstash) {
      await publishProjectionRefreshJobs(config.qstash, result.projectionRefreshJobs);
    }

    const detail = result.changed ? await getFlagDetail(db, access.flag.id) : currentDetail;

    return reply.send({
      changed: result.changed,
      detail,
    });
  });
}
