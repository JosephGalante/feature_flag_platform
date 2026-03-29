import {
  type MembershipRole,
  environments,
  memberships,
  organizations,
  projects,
  users,
} from "@packages/shared/src/database.js";
import {and, asc, eq} from "drizzle-orm";
import type {ApiDatabase} from "../lib/database.js";

export type AdminUserSummary = {
  email: string;
  id: string;
  name: string;
};

export type AdminMembershipSummary = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: MembershipRole;
};

export type ProjectSummary = {
  createdAt: Date;
  id: string;
  key: string;
  name: string;
  organizationId: string;
};

export type EnvironmentSummary = {
  createdAt: Date;
  id: string;
  key: string;
  name: string;
  projectId: string;
  sortOrder: number;
};

export async function findUserByEmail(
  db: ApiDatabase,
  email: string,
): Promise<AdminUserSummary | null> {
  const [user] = await db
    .select({
      email: users.email,
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user ?? null;
}

export async function findUserById(
  db: ApiDatabase,
  userId: string,
): Promise<AdminUserSummary | null> {
  const [user] = await db
    .select({
      email: users.email,
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function listMembershipsForUser(
  db: ApiDatabase,
  userId: string,
): Promise<AdminMembershipSummary[]> {
  return db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      organizationSlug: organizations.slug,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(organizations.name));
}

export async function listProjectsForOrganization(
  db: ApiDatabase,
  organizationId: string,
): Promise<ProjectSummary[]> {
  return db
    .select({
      createdAt: projects.createdAt,
      id: projects.id,
      key: projects.key,
      name: projects.name,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .where(eq(projects.organizationId, organizationId))
    .orderBy(asc(projects.name));
}

export async function findAuthorizedProject(
  db: ApiDatabase,
  projectId: string,
  userId: string,
): Promise<ProjectSummary | null> {
  const [project] = await db
    .select({
      createdAt: projects.createdAt,
      id: projects.id,
      key: projects.key,
      name: projects.name,
      organizationId: projects.organizationId,
    })
    .from(projects)
    .innerJoin(memberships, eq(projects.organizationId, memberships.organizationId))
    .where(and(eq(projects.id, projectId), eq(memberships.userId, userId)))
    .limit(1);

  return project ?? null;
}

export async function listEnvironmentsForProject(
  db: ApiDatabase,
  projectId: string,
): Promise<EnvironmentSummary[]> {
  return db
    .select({
      createdAt: environments.createdAt,
      id: environments.id,
      key: environments.key,
      name: environments.name,
      projectId: environments.projectId,
      sortOrder: environments.sortOrder,
    })
    .from(environments)
    .where(eq(environments.projectId, projectId))
    .orderBy(asc(environments.sortOrder), asc(environments.name));
}
