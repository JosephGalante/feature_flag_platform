import { integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export type MembershipRole = "admin" | "developer" | "owner" | "viewer";

export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "admin",
  "developer",
  "viewer",
]);

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

export const databaseSchema = {
  users,
  organizations,
  memberships,
  projects,
  environments,
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
