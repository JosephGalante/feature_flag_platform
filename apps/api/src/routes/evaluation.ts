import type {EvaluationContext} from "@feature-flag-platform/evaluation-core";
import type {FastifyInstance} from "fastify";
import {z} from "zod";
import type {ApiConfig} from "../config";
import {authenticateEvaluationApiKey} from "../evaluation/api-keys";
import {readRawApiKeyFromHeaders} from "../lib/api-keys";
import type {ApiDatabase} from "../lib/database";
import {readEnvironmentProjection} from "../lib/redis-projections";
import {previewFlagEvaluation} from "../projections/preview-flag-evaluation";

const evaluateBodySchema = z.object({
  context: z.record(z.string()).default({}),
  flagKey: z.string().trim().min(1),
});

export async function registerEvaluationRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.post("/api/evaluate", async (request, reply) => {
    const parsedBody = evaluateBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedBody.error.flatten(),
      });
    }

    const rawApiKey = readRawApiKeyFromHeaders(request.headers);

    if (!rawApiKey) {
      return reply.code(401).send({
        error: "INVALID_API_KEY",
        message: "A valid evaluation API key is required.",
      });
    }

    const access = await authenticateEvaluationApiKey(db, rawApiKey);

    if (!access) {
      return reply.code(401).send({
        error: "INVALID_API_KEY",
        message: "A valid evaluation API key is required.",
      });
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
      return reply.code(503).send({
        error: "PROJECTION_NOT_READY",
        message: "No Redis projection exists for this API key environment.",
      });
    }

    return reply.send(result.result);
  });
}
