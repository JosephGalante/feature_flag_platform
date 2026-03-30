import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import type {FastifyInstance} from "fastify";
import {z} from "zod";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";
import {
  buildQStashProjectionRefreshUrl,
  verifyQStashRequest as verifySignedQStashRequest,
} from "../lib/qstash";
import {readEnvironmentProjection} from "../lib/redis-projections";
import {rebuildEnvironmentProjection} from "../projections/rebuild-environment-projection";
import {readProjectionRefreshJobPayload} from "../projections/refresh-jobs";

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

type InternalProjectionRouteDependencies = {
  rebuildProjection: typeof rebuildEnvironmentProjection;
  verifyQStashRequest: (input: {
    body: string;
    qstashConfig: NonNullable<ApiConfig["qstash"]>;
    signature: string;
    url: string;
  }) => Promise<void>;
};

const defaultDependencies: InternalProjectionRouteDependencies = {
  rebuildProjection: rebuildEnvironmentProjection,
  verifyQStashRequest: async (input) => {
    await verifySignedQStashRequest(input.qstashConfig, {
      body: input.body,
      signature: input.signature,
      url: input.url,
    });
  },
};

export async function registerInternalProjectionRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
  dependencies: InternalProjectionRouteDependencies = defaultDependencies,
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

    const result = await dependencies.rebuildProjection(
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

  if (!config.qstash) {
    return;
  }

  const qstashConfig = config.qstash;

  app.post("/internal/projections/rebuild-async", async (request, reply) => {
    const signature = request.headers["upstash-signature"];

    if (typeof request.body !== "string") {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        message: "Expected the raw QStash payload body as a string.",
      });
    }

    if (typeof signature !== "string" || signature.length === 0) {
      return reply.code(401).send({
        error: "INVALID_QSTASH_SIGNATURE",
        message: "The Upstash signature header is missing.",
      });
    }

    try {
      await dependencies.verifyQStashRequest({
        body: request.body,
        qstashConfig,
        signature,
        url: buildQStashProjectionRefreshUrl(qstashConfig.publicApiBaseUrl),
      });
    } catch {
      return reply.code(401).send({
        error: "INVALID_QSTASH_SIGNATURE",
        message: "The Upstash signature could not be verified.",
      });
    }

    let parsedBody: unknown;

    try {
      parsedBody = JSON.parse(request.body);
    } catch {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        message: "The QStash payload body must be valid JSON.",
      });
    }

    const payload = readProjectionRefreshJobPayload(parsedBody);

    if (!payload) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        message: "The QStash payload is missing required projection rebuild fields.",
      });
    }

    const result = await dependencies.rebuildProjection(db, config.redisUrl, payload.environmentId);

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
