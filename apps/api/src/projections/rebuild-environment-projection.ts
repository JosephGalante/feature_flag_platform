import type {CompiledEnvironmentProjection} from "@feature-flag-platform/evaluation-core";
import type {ApiDatabase} from "../lib/database";
import {
  buildEnvironmentProjectionRedisKey,
  writeEnvironmentProjection,
} from "../lib/redis-projections";
import {buildEnvironmentProjection} from "./environment-projection";

type RebuildEnvironmentProjectionDependencies = {
  buildProjection: (
    environmentId: string,
    generatedAt: Date,
  ) => Promise<CompiledEnvironmentProjection | null>;
  writeProjection: (projection: CompiledEnvironmentProjection) => Promise<void>;
};

type RebuildEnvironmentProjectionResult = {
  projection: CompiledEnvironmentProjection;
  redisKey: string;
};

export async function persistEnvironmentProjection(
  dependencies: RebuildEnvironmentProjectionDependencies,
  environmentId: string,
  generatedAt: Date = new Date(),
): Promise<RebuildEnvironmentProjectionResult | null> {
  const projection = await dependencies.buildProjection(environmentId, generatedAt);

  if (!projection) {
    return null;
  }

  await dependencies.writeProjection(projection);

  return {
    projection,
    redisKey: buildEnvironmentProjectionRedisKey(projection.environmentId),
  };
}

export async function rebuildEnvironmentProjection(
  db: ApiDatabase,
  redisUrl: string,
  environmentId: string,
  generatedAt: Date = new Date(),
): Promise<RebuildEnvironmentProjectionResult | null> {
  return await persistEnvironmentProjection(
    {
      buildProjection: async (nextEnvironmentId, nextGeneratedAt) =>
        await buildEnvironmentProjection(db, nextEnvironmentId, nextGeneratedAt),
      writeProjection: async (projection) => await writeEnvironmentProjection(redisUrl, projection),
    },
    environmentId,
    generatedAt,
  );
}
