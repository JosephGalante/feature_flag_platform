import type {JsonValue} from "@shared/json";
import {z} from "zod";

export const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

export const flagParamsSchema = z.object({
  flagId: z.string().uuid(),
});

export const flagListQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
});

export const createFlagBodySchema = z.object({
  description: z.string().trim().min(1).nullable().optional(),
  flagType: z.enum(["boolean", "variant"]),
  key: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const updateFlagBodySchema = z
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

export const configurationBodySchema = z.object({
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

export const previewBodySchema = z.object({
  context: z.record(z.string()).default({}),
  environmentId: z.string().uuid(),
});

export type ConfigurationBody = z.infer<typeof configurationBodySchema>;
