import type {EvaluationContext} from "@feature-flag-platform/evaluation-core";
import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {z} from "zod";
import type {ApiConfig} from "../config";
import {authenticateEvaluationApiKey} from "../evaluation/api-keys";
import {readRawApiKeyFromHeaders} from "../lib/api-keys";
import type {ApiDatabase} from "../lib/database";
import {readEnvironmentProjection} from "../lib/redis-projections";
import {
  previewFlagBatchEvaluation,
  previewFlagEvaluation,
} from "../projections/preview-flag-evaluation";

const evaluateBodySchema = z.object({
  context: z.record(z.string()).default({}),
  flagKey: z.string().trim().min(1),
});

const batchEvaluateBodySchema = z.object({
  context: z.record(z.string()).default({}),
  flagKeys: z.array(z.string().trim().min(1)).min(1),
});

export async function registerEvaluationRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  async function authenticateRequest(request: FastifyRequest, reply: FastifyReply) {
    const rawApiKey = readRawApiKeyFromHeaders(request.headers);

    if (!rawApiKey) {
      await reply.code(401).send({
        error: "INVALID_API_KEY",
        message: "A valid evaluation API key is required.",
      });
      return null;
    }

    const access = await authenticateEvaluationApiKey(db, rawApiKey);

    if (!access) {
      await reply.code(401).send({
        error: "INVALID_API_KEY",
        message: "A valid evaluation API key is required.",
      });
      return null;
    }

    return access;
  }

  function projectionNotReady(reply: FastifyReply) {
    return reply.code(503).send({
      error: "PROJECTION_NOT_READY",
      message: "No Redis projection exists for this API key environment.",
    });
  }

  app.post("/api/evaluate", async (request, reply) => {
    const parsedBody = evaluateBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedBody.error.flatten(),
      });
    }

    const access = await authenticateRequest(request, reply);

    if (!access) {
      return reply;
    }

    const result = await previewFlagEvaluation(
      {
        readProjection: async (environmentId) =>
          await readEnvironmentProjection(config.redisUrl, environmentId),
      },
      {
        context: parsedBody.data.context satisfies EvaluationContext,
        environmentId: access.environmentId,
        flagKey: parsedBody.data.flagKey,
      },
    );

    if (result.status === "projection_not_found") {
      return projectionNotReady(reply);
    }

    return reply.send(result.result);
  });

  app.post("/api/evaluate/batch", async (request, reply) => {
    const parsedBody = batchEvaluateBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedBody.error.flatten(),
      });
    }

    const access = await authenticateRequest(request, reply);

    if (!access) {
      return reply;
    }

    const result = await previewFlagBatchEvaluation(
      {
        readProjection: async (environmentId) =>
          await readEnvironmentProjection(config.redisUrl, environmentId),
      },
      {
        context: parsedBody.data.context satisfies EvaluationContext,
        environmentId: access.environmentId,
        flagKeys: parsedBody.data.flagKeys,
      },
    );

    if (result.status === "projection_not_found") {
      return projectionNotReady(reply);
    }

    return reply.send(result.result);
  });
}
