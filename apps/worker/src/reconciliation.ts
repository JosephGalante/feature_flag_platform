import {environments, flagEnvironmentConfigs} from "@shared/database";
import {asc, eq, sql} from "drizzle-orm";
import {readEnvironmentProjection} from "../../api/src/lib/redis-projections";
import type {WorkerDatabase} from "./lib/database";

type EnvironmentProjectionVersionRow = {
  environmentId: string;
  postgresProjectionVersion: number;
};

type ReconciliationDependencies = {
  listEnvironmentProjectionVersions: (
    db: WorkerDatabase,
  ) => Promise<EnvironmentProjectionVersionRow[]>;
  readProjection: typeof readEnvironmentProjection;
};

export type EnvironmentProjectionHealth = {
  environmentId: string;
  postgresProjectionVersion: number;
  redisProjectionVersion: number | null;
  status: "fresh" | "missing" | "stale";
};

const defaultDependencies: ReconciliationDependencies = {
  listEnvironmentProjectionVersions,
  readProjection: readEnvironmentProjection,
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
  dependencies: ReconciliationDependencies = defaultDependencies,
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
): EnvironmentProjectionHealth[] {
  return environments.filter((environment) => environment.status !== "fresh");
}
