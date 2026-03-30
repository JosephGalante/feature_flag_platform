import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import type {FastifyInstance} from "fastify";
import {z} from "zod";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";
import {readEnvironmentProjection} from "../lib/redis-projections";
import {rebuildEnvironmentProjection} from "../projections/rebuild-environment-projection";

const environmentParamsSchema = z.object({
  environmentId: z.string().uuid(),
});

function summarizeProjection(input: {
  projection: CompiledEnvironmentProjection;
  redisKey: string;
}) {
  return {
    environmentId: input.projection.environmentId,
    flagCount: Object.keys(input.projection.flags).length,
    generatedAt: input.projection.generatedAt,
    projectionVersion: input.projection.projectionVersion,
    redisKey: input.redisKey,
  };
}

export async function registerInternalProjectionRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.get("/internal/projection-status/:environmentId", async (request, reply) => {
    const parsedParams = environmentParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const projection = await readEnvironmentProjection(
      config.redisUrl,
      parsedParams.data.environmentId,
    );

    if (!projection) {
      return reply.code(404).send({
        error: "PROJECTION_NOT_FOUND",
        message: "No Redis projection exists for that environment.",
      });
    }

    return reply.send(
      summarizeProjection({
        projection,
        redisKey: `ff:env_projection:${projection.environmentId}`,
      }),
    );
  });

  app.post("/internal/projections/:environmentId/rebuild", async (request, reply) => {
    const parsedParams = environmentParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const result = await rebuildEnvironmentProjection(
      db,
      config.redisUrl,
      parsedParams.data.environmentId,
    );

    if (!result) {
      return reply.code(404).send({
        error: "ENVIRONMENT_NOT_FOUND",
        message: "Environment could not be found in Postgres.",
      });
    }

    return reply.send(
      summarizeProjection({
        projection: result.projection,
        redisKey: result.redisKey,
      }),
    );
  });
}
