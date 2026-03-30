import type {EvaluationContext} from "@feature-flag-platform/evaluation-core";
import type {JsonValue} from "@shared/json";
import type {FastifyInstance} from "fastify";
import {z} from "zod";
import {requireAuthenticatedAdmin, requireOrganizationWriteAccess} from "../admin/auth";
import {
  type ConfigurationEnvironmentInput,
  type ConfigurationRuleInput,
  type ConfigurationVariantInput,
  createFlag,
  findAuthorizedFlagAccess,
  getFlagDetail,
  listFlagsForProject,
  replaceFlagConfiguration,
  updateFlagMetadata,
} from "../admin/flags";
import {findAuthorizedProject, listEnvironmentsForProject} from "../admin/service";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";
import {readEnvironmentProjection} from "../lib/redis-projections";
import {previewFlagEvaluation} from "../projections/preview-flag-evaluation";

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

const flagParamsSchema = z.object({
  flagId: z.string().uuid(),
});

const flagListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

const createFlagBodySchema = z.object({
  description: z.string().trim().min(1).nullable().optional(),
  flagType: z.enum(["boolean", "variant"]),
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

const updateFlagBodySchema = z
  .object({
    description: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1).optional(),
    status: z.enum(["active", "archived"]).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.status !== undefined,
    {
      message: "At least one field must be provided.",
      path: ["body"],
    },
  );

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

const attributeMatchRuleSchema = z.object({
  attributeKey: z.string().trim().min(1),
  comparisonValue: z.union([z.string(), z.array(z.string().trim().min(1)).min(1)]),
  operator: z.enum(["equals", "in"]),
  ruleType: z.literal("attribute_match"),
  sortOrder: z.number().int().positive(),
  variantKey: z.string().trim().min(1),
});

const percentageRolloutRuleSchema = z.object({
  rolloutPercentage: z.number().int().min(0).max(100),
  ruleType: z.literal("percentage_rollout"),
  sortOrder: z.number().int().positive(),
  variantKey: z.string().trim().min(1),
});

const configurationBodySchema = z.object({
  environments: z.array(
    z.object({
      defaultVariantKey: z.string().trim().min(1),
      enabled: z.boolean(),
      environmentId: z.string().uuid(),
      rules: z.array(z.union([attributeMatchRuleSchema, percentageRolloutRuleSchema])),
    }),
  ),
  variants: z.array(
    z.object({
      description: z.string().trim().min(1).nullable().optional(),
      key: z.string().trim().min(1),
      value: jsonValueSchema,
    }),
  ),
});

const previewBodySchema = z.object({
  context: z.record(z.string()).default({}),
  environmentId: z.string().uuid(),
});

function isKnownServiceError(
  error: unknown,
): error is Error & {message: "FLAG_KEY_ALREADY_EXISTS"} {
  return error instanceof Error && error.message === "FLAG_KEY_ALREADY_EXISTS";
}

function validateConfigurationPayload(input: {
  currentDetail: NonNullable<Awaited<ReturnType<typeof getFlagDetail>>>;
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
}): string[] {
  const issues: string[] = [];
  const variantKeys = new Set<string>();

  if (input.variants.length === 0) {
    issues.push("variants must contain at least one variant.");
  }

  for (const variant of input.variants) {
    if (variantKeys.has(variant.key)) {
      issues.push(`variants contains duplicate key '${variant.key}'.`);
      continue;
    }

    variantKeys.add(variant.key);
  }

  const expectedEnvironmentIds = new Set(
    input.currentDetail.environments.map((environment) => environment.environment.id),
  );
  const seenEnvironmentIds = new Set<string>();

  if (input.environments.length !== expectedEnvironmentIds.size) {
    issues.push("environments must include every existing project environment exactly once.");
  }

  for (const environment of input.environments) {
    if (!expectedEnvironmentIds.has(environment.environmentId)) {
      issues.push(`environment '${environment.environmentId}' does not belong to this flag.`);
    }

    if (seenEnvironmentIds.has(environment.environmentId)) {
      issues.push(`environments contains duplicate environmentId '${environment.environmentId}'.`);
      continue;
    }

    seenEnvironmentIds.add(environment.environmentId);

    if (!variantKeys.has(environment.defaultVariantKey)) {
      issues.push(
        `environment '${environment.environmentId}' references missing defaultVariantKey '${environment.defaultVariantKey}'.`,
      );
    }

    const seenSortOrders = new Set<number>();

    for (const rule of environment.rules) {
      if (seenSortOrders.has(rule.sortOrder)) {
        issues.push(
          `environment '${environment.environmentId}' contains duplicate sortOrder '${rule.sortOrder}'.`,
        );
      } else {
        seenSortOrders.add(rule.sortOrder);
      }

      if (!variantKeys.has(rule.variantKey)) {
        issues.push(
          `environment '${environment.environmentId}' rule '${rule.sortOrder}' references missing variantKey '${rule.variantKey}'.`,
        );
      }

      if (rule.ruleType === "attribute_match") {
        if (rule.operator === "equals" && typeof rule.comparisonValue !== "string") {
          issues.push(
            `environment '${environment.environmentId}' rule '${rule.sortOrder}' must use a string comparisonValue for equals.`,
          );
        }

        if (rule.operator === "in" && !Array.isArray(rule.comparisonValue)) {
          issues.push(
            `environment '${environment.environmentId}' rule '${rule.sortOrder}' must use an array comparisonValue for in.`,
          );
        }
      }
    }
  }

  for (const environmentId of expectedEnvironmentIds) {
    if (!seenEnvironmentIds.has(environmentId)) {
      issues.push(`environments is missing required environment '${environmentId}'.`);
    }
  }

  return issues;
}

export async function registerAdminFlagRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.get("/api/admin/projects/:projectId/flags", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

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

    if (!admin) {
      return;
    }

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
      const flag = await createFlag(db, {
        actorUserId: admin.user.id,
        description: parsedBody.data.description ?? null,
        flagType: parsedBody.data.flagType,
        key: parsedBody.data.key,
        name: parsedBody.data.name,
        organizationId: project.organizationId,
        projectId: project.id,
        requestId: request.id,
      });

      return reply.code(201).send({
        flag,
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

    if (!admin) {
      return;
    }

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

    if (!admin) {
      return;
    }

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

    if (!admin) {
      return;
    }

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

    const flag = await updateFlagMetadata(db, {
      action: nextAction,
      actorUserId: admin.user.id,
      flag: access.flag,
      requestId: request.id,
      ...(parsedBody.data.description !== undefined
        ? {description: parsedBody.data.description}
        : {}),
      ...(parsedBody.data.name !== undefined ? {name: parsedBody.data.name} : {}),
      ...(parsedBody.data.status !== undefined ? {status: parsedBody.data.status} : {}),
    });

    return reply.send({
      flag,
    });
  });

  app.post("/api/admin/flags/:flagId/archive", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

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

    const flag = await updateFlagMetadata(db, {
      action: "flag.archived",
      actorUserId: admin.user.id,
      flag: access.flag,
      requestId: request.id,
      status: "archived",
    });

    return reply.send({
      flag,
    });
  });

  app.put("/api/admin/flags/:flagId/configuration", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

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

    const variants: ConfigurationVariantInput[] = parsedBody.data.variants.map((variant) => ({
      description: variant.description ?? null,
      key: variant.key,
      value: variant.value,
    }));
    const environments: ConfigurationEnvironmentInput[] = parsedBody.data.environments.map(
      (environment) => ({
        defaultVariantKey: environment.defaultVariantKey,
        enabled: environment.enabled,
        environmentId: environment.environmentId,
        rules: environment.rules.map(
          (rule): ConfigurationRuleInput =>
            rule.ruleType === "attribute_match"
              ? {
                  attributeKey: rule.attributeKey,
                  comparisonValue: rule.comparisonValue,
                  operator: rule.operator,
                  ruleType: "attribute_match",
                  sortOrder: rule.sortOrder,
                  variantKey: rule.variantKey,
                }
              : {
                  rolloutPercentage: rule.rolloutPercentage,
                  ruleType: "percentage_rollout",
                  sortOrder: rule.sortOrder,
                  variantKey: rule.variantKey,
                },
        ),
      }),
    );

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
      requestId: request.id,
      variants,
    });

    const detail = result.changed ? await getFlagDetail(db, access.flag.id) : currentDetail;

    return reply.send({
      changed: result.changed,
      detail,
    });
  });
}
