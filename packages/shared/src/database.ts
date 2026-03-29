import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { JsonValue } from "./json.js";

export type MembershipRole = "admin" | "developer" | "owner" | "viewer";
export type FeatureFlagType = "boolean" | "variant";
export type FeatureFlagStatus = "active" | "archived";
export type FlagRuleType = "attribute_match" | "percentage_rollout";
export type FlagRuleOperator = "equals" | "in";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "developer",
  "viewer",
]);
export const featureFlagTypeEnum = pgEnum("feature_flag_type", ["boolean", "variant"]);
export const featureFlagStatusEnum = pgEnum("feature_flag_status", ["active", "archived"]);
export const flagRuleTypeEnum = pgEnum("flag_rule_type", ["attribute_match", "percentage_rollout"]);
export const flagRuleOperatorEnum = pgEnum("flag_rule_operator", ["equals", "in"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailKey: unique("users_email_key").on(table.email),
  }),
);

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugKey: unique("organizations_slug_key").on(table.slug),
  }),
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationUserKey: unique("memberships_organization_id_user_id_key").on(
      table.organizationId,
      table.userId,
    ),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    organizationKeyKey: unique("projects_organization_id_key_key").on(
      table.organizationId,
      table.key,
    ),
  }),
);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectKeyKey: unique("environments_project_id_key_key").on(table.projectId, table.key),
  }),
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    flagType: featureFlagTypeEnum("flag_type").notNull(),
    status: featureFlagStatusEnum("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    projectKeyKey: unique("feature_flags_project_id_key_key").on(table.projectId, table.key),
  }),
);

export const flagEnvironmentConfigs = pgTable(
  "flag_environment_configs",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    featureFlagId: uuid("feature_flag_id")
      .notNull()
      .references(() => featureFlags.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
    defaultVariantKey: text("default_variant_key").notNull(),
    projectionVersion: integer("projection_version").notNull().default(1),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    featureFlagEnvironmentKey: unique(
      "flag_environment_configs_feature_flag_id_environment_id_key",
    ).on(table.featureFlagId, table.environmentId),
  }),
);

export const flagVariants = pgTable(
  "flag_variants",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    featureFlagId: uuid("feature_flag_id")
      .notNull()
      .references(() => featureFlags.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    valueJson: jsonb("value_json").$type<JsonValue>().notNull(),
    description: text("description"),
  },
  (table) => ({
    featureFlagKeyKey: unique("flag_variants_feature_flag_id_key_key").on(
      table.featureFlagId,
      table.key,
    ),
  }),
);

export const flagRules = pgTable(
  "flag_rules",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),
    flagEnvironmentConfigId: uuid("flag_environment_config_id")
      .notNull()
      .references(() => flagEnvironmentConfigs.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
    ruleType: flagRuleTypeEnum("rule_type").notNull(),
    attributeKey: text("attribute_key"),
    operator: flagRuleOperatorEnum("operator"),
    comparisonValueJson: jsonb("comparison_value_json").$type<JsonValue>(),
    rolloutPercentage: integer("rollout_percentage"),
    variantKey: text("variant_key").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    flagEnvironmentConfigSortOrderKey: unique(
      "flag_rules_flag_environment_config_id_sort_order_key",
    ).on(table.flagEnvironmentConfigId, table.sortOrder),
  }),
);

export const databaseSchema = {
  users,
  organizations,
  memberships,
  projects,
  environments,
  featureFlags,
  flagEnvironmentConfigs,
  flagVariants,
  flagRules,
};

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Environment = typeof environments.$inferSelect;
export type NewEnvironment = typeof environments.$inferInsert;

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type NewFeatureFlag = typeof featureFlags.$inferInsert;

export type FlagEnvironmentConfig = typeof flagEnvironmentConfigs.$inferSelect;
export type NewFlagEnvironmentConfig = typeof flagEnvironmentConfigs.$inferInsert;

export type FlagVariant = typeof flagVariants.$inferSelect;
export type NewFlagVariant = typeof flagVariants.$inferInsert;

export type FlagRule = typeof flagRules.$inferSelect;
export type NewFlagRule = typeof flagRules.$inferInsert;
