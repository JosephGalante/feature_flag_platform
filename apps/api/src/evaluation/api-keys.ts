import {apiKeys, environments, projects} from "@shared/database";
import {and, eq} from "drizzle-orm";
import {parseApiKey} from "../lib/api-keys";
import type {ApiDatabase} from "../lib/database";

type EvaluationApiKeyAccess = {
  apiKeyId: string;
  environmentId: string;
  keyPrefix: string;
  organizationId: string;
  projectId: string;
};

export async function authenticateEvaluationApiKey(
  db: ApiDatabase,
  rawKey: string,
): Promise<EvaluationApiKeyAccess | null> {
  const parsedKey = parseApiKey(rawKey);

  if (!parsedKey) {
    return null;
  }

  return db.transaction(async (trx) => {
    const [apiKey] = await trx
      .select({
        apiKeyId: apiKeys.id,
        environmentId: apiKeys.environmentId,
        keyPrefix: apiKeys.keyPrefix,
        organizationId: projects.organizationId,
        projectId: environments.projectId,
      })
      .from(apiKeys)
      .innerJoin(environments, eq(apiKeys.environmentId, environments.id))
      .innerJoin(projects, eq(environments.projectId, projects.id))
      .where(
        and(
          eq(apiKeys.keyHash, parsedKey.keyHash),
          eq(apiKeys.keyPrefix, parsedKey.keyPrefix),
          eq(apiKeys.status, "active"),
        ),
      )
      .limit(1);

    if (!apiKey) {
      return null;
    }

    await trx
      .update(apiKeys)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(apiKeys.id, apiKey.apiKeyId));

    return apiKey;
  });
}
