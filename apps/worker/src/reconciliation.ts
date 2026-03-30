import {environments, flagEnvironmentConfigs} from "@shared/database";
import {asc, eq, sql} from "drizzle-orm";
import {readEnvironmentProjection} from "../../api/src/lib/redis-projections";
import {rebuildEnvironmentProjection} from "../../api/src/projections/rebuild-environment-projection";
import type {WorkerDatabase} from "./lib/database";

type EnvironmentProjectionVersionRow = {
  environmentId: string;
  postgresProjectionVersion: number;
};

type ReconciliationScanDependencies = {
  listEnvironmentProjectionVersions: (
    db: WorkerDatabase,
  ) => Promise<EnvironmentProjectionVersionRow[]>;
  readProjection: typeof readEnvironmentProjection;
};

type ReconciliationRepairDependencies = ReconciliationScanDependencies & {
  rebuildProjection: typeof rebuildEnvironmentProjection;
};

export type EnvironmentProjectionHealth = {
  environmentId: string;
  postgresProjectionVersion: number;
  redisProjectionVersion: number | null;
  status: "fresh" | "missing" | "stale";
};

type EnvironmentProjectionNeedingRepair = EnvironmentProjectionHealth & {
  status: "missing" | "stale";
};

export type RepairedEnvironmentProjection = {
  environmentId: string;
  repairedProjectionVersion: number;
  previousStatus: "missing" | "stale";
};

export type ReconciliationRepairResult = {
  failedEnvironmentIds: string[];
  repairedEnvironments: RepairedEnvironmentProjection[];
  skippedCount: number;
};

const defaultScanDependencies: ReconciliationScanDependencies = {
  listEnvironmentProjectionVersions,
  readProjection: readEnvironmentProjection,
};

const defaultRepairDependencies: ReconciliationRepairDependencies = {
  ...defaultScanDependencies,
  rebuildProjection: rebuildEnvironmentProjection,
};

export async function listEnvironmentProjectionVersions(
  db: WorkerDatabase,
): Promise<EnvironmentProjectionVersionRow[]> {
  return await db
    .select({
      environmentId: environments.id,
      postgresProjectionVersion: sql<number>`coalesce(max(${flagEnvironmentConfigs.projectionVersion}), 0)`,
    })
    .from(environments)
    .leftJoin(flagEnvironmentConfigs, eq(flagEnvironmentConfigs.environmentId, environments.id))
    .groupBy(environments.id)
    .orderBy(asc(environments.id));
}

export function classifyEnvironmentProjectionHealth(input: {
  postgresProjectionVersion: number;
  redisProjectionVersion: number | null;
}): EnvironmentProjectionHealth["status"] {
  if (input.redisProjectionVersion === null) {
    return "missing";
  }

  return input.redisProjectionVersion === input.postgresProjectionVersion ? "fresh" : "stale";
}

export async function scanEnvironmentProjectionHealth(
  db: WorkerDatabase,
  redisUrl: string,
  dependencies: ReconciliationScanDependencies = defaultScanDependencies,
): Promise<EnvironmentProjectionHealth[]> {
  const environments = await dependencies.listEnvironmentProjectionVersions(db);
  const results: EnvironmentProjectionHealth[] = [];

  for (const environment of environments) {
    const projection = await dependencies.readProjection(redisUrl, environment.environmentId);
    const redisProjectionVersion = projection?.projectionVersion ?? null;

    results.push({
      environmentId: environment.environmentId,
      postgresProjectionVersion: environment.postgresProjectionVersion,
      redisProjectionVersion,
      status: classifyEnvironmentProjectionHealth({
        postgresProjectionVersion: environment.postgresProjectionVersion,
        redisProjectionVersion,
      }),
    });
  }

  return results;
}

export function filterEnvironmentsNeedingRepair(
  environments: ReadonlyArray<EnvironmentProjectionHealth>,
): EnvironmentProjectionNeedingRepair[] {
  return environments.filter(
    (environment): environment is EnvironmentProjectionNeedingRepair =>
      environment.status !== "fresh",
  );
}

export async function repairEnvironmentProjectionDrift(
  db: WorkerDatabase,
  redisUrl: string,
  generatedAt: Date = new Date(),
  dependencies: ReconciliationRepairDependencies = defaultRepairDependencies,
): Promise<ReconciliationRepairResult> {
  const environments = await scanEnvironmentProjectionHealth(db, redisUrl, dependencies);
  const environmentsNeedingRepair = filterEnvironmentsNeedingRepair(environments);
  const repairedEnvironments: RepairedEnvironmentProjection[] = [];
  const failedEnvironmentIds: string[] = [];

  for (const environment of environmentsNeedingRepair) {
    try {
      const rebuildResult = await dependencies.rebuildProjection(
        db,
        redisUrl,
        environment.environmentId,
        generatedAt,
      );

      if (!rebuildResult) {
        failedEnvironmentIds.push(environment.environmentId);
        continue;
      }

      repairedEnvironments.push({
        environmentId: environment.environmentId,
        previousStatus: environment.status,
        repairedProjectionVersion: rebuildResult.projection.projectionVersion,
      });
    } catch {
      failedEnvironmentIds.push(environment.environmentId);
    }
  }

  return {
    failedEnvironmentIds,
    repairedEnvironments,
    skippedCount: environments.length - environmentsNeedingRepair.length,
  };
}
