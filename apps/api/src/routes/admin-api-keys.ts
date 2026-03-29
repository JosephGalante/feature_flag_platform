import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {
  createApiKey,
  findAuthorizedApiKeyAccess,
  findAuthorizedEnvironmentAccess,
  listApiKeysForEnvironment,
  revokeApiKey,
} from "../admin/api-keys";
import {requireAuthenticatedAdmin, requireOrganizationWriteAccess} from "../admin/auth";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";

const environmentParamsSchema = z.object({
  environmentId: z.string().uuid(),
});

const apiKeyParamsSchema = z.object({
  apiKeyId: z.string().uuid(),
});

const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1),
});

export async function registerAdminApiKeyRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.get("/api/admin/environments/:environmentId/api-keys", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = environmentParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const access = await findAuthorizedEnvironmentAccess(
      db,
      parsedParams.data.environmentId,
      admin.user.id,
    );

    if (!access) {
      return reply.code(404).send({
        error: "ENVIRONMENT_NOT_FOUND",
        message: "Environment was not found for the current admin.",
      });
    }

    const apiKeys = await listApiKeysForEnvironment(db, access.environment.id);

    return reply.send({
      apiKeys,
      environment: access.environment,
    });
  });

  app.post("/api/admin/environments/:environmentId/api-keys", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = environmentParamsSchema.safeParse(request.params);
    const parsedBody = createApiKeyBodySchema.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: {
          body: parsedBody.success ? undefined : parsedBody.error.flatten(),
          params: parsedParams.success ? undefined : parsedParams.error.flatten(),
        },
      });
    }

    const access = await findAuthorizedEnvironmentAccess(
      db,
      parsedParams.data.environmentId,
      admin.user.id,
    );

    if (!access) {
      return reply.code(404).send({
        error: "ENVIRONMENT_NOT_FOUND",
        message: "Environment was not found for the current admin.",
      });
    }

    const hasWriteAccess = await requireOrganizationWriteAccess(
      admin,
      access.environment.organizationId,
      reply,
    );

    if (!hasWriteAccess) {
      return;
    }

    const result = await createApiKey(db, {
      actorUserId: admin.user.id,
      environment: access.environment,
      name: parsedBody.data.name,
      requestId: request.id,
    });

    return reply.code(201).send(result);
  });

  app.post("/api/admin/api-keys/:apiKeyId/revoke", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = apiKeyParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const access = await findAuthorizedApiKeyAccess(db, parsedParams.data.apiKeyId, admin.user.id);

    if (!access) {
      return reply.code(404).send({
        error: "API_KEY_NOT_FOUND",
        message: "API key was not found for the current admin.",
      });
    }

    const hasWriteAccess = await requireOrganizationWriteAccess(
      admin,
      access.apiKey.organizationId,
      reply,
    );

    if (!hasWriteAccess) {
      return;
    }

    const apiKey = await revokeApiKey(db, {
      actorUserId: admin.user.id,
      apiKey: access.apiKey,
      requestId: request.id,
    });

    return reply.send({
      apiKey,
    });
  });
}
