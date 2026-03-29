import type {
  MembershipRole,
  NewEnvironment,
  NewOrganization,
  NewProject,
  NewUser,
} from "@packages/shared/src/database.js";
import {
  environments,
  memberships,
  organizations,
  projects,
  users,
} from "@packages/shared/src/database.js";
import {and, eq} from "drizzle-orm";
import {type AppDatabase, createDatabase} from "./lib/database.js";

const demoUser: NewUser = {
  email: "owner@acme.test",
  name: "Acme Owner",
};

const demoOrganization: NewOrganization = {
  name: "Acme Corp",
  slug: "acme",
};

const demoProject: Omit<NewProject, "organizationId"> = {
  key: "checkout",
  name: "Checkout",
};

const demoEnvironments: Array<Omit<NewEnvironment, "projectId">> = [
  {key: "dev", name: "Development", sortOrder: 10},
  {key: "staging", name: "Staging", sortOrder: 20},
  {key: "prod", name: "Production", sortOrder: 30},
];

async function ensureUser(db: AppDatabase, values: NewUser): Promise<string> {
  const [existing] = await db
    .select({id: users.id})
    .from(users)
    .where(eq(users.email, values.email))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [inserted] = await db.insert(users).values(values).returning({id: users.id});

  if (!inserted) {
    throw new Error("Failed to insert user in ensureUser");
  }

  return inserted.id;
}

async function ensureOrganization(db: AppDatabase, values: NewOrganization): Promise<string> {
  const [existing] = await db
    .select({id: organizations.id})
    .from(organizations)
    .where(eq(organizations.slug, values.slug))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [inserted] = await db
    .insert(organizations)
    .values(values)
    .returning({id: organizations.id});

  if (!inserted) {
    throw new Error("Failed to insert organization in ensureOrganization");
  }

  return inserted.id;
}

async function ensureMembership(
  db: AppDatabase,
  organizationId: string,
  userId: string,
  role: MembershipRole,
): Promise<void> {
  await db
    .insert(memberships)
    .values({
      organizationId,
      role,
      userId,
    })
    .onConflictDoNothing({
      target: [memberships.organizationId, memberships.userId],
    });
}

async function ensureProject(
  db: AppDatabase,
  organizationId: string,
  values: Omit<NewProject, "organizationId">,
): Promise<string> {
  const [existing] = await db
    .select({id: projects.id})
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.key, values.key)))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const [inserted] = await db
    .insert(projects)
    .values({
      organizationId,
      ...values,
    })
    .returning({id: projects.id});

  if (!inserted) {
    throw new Error("Failed to insert project in ensureProject");
  }

  return inserted.id;
}

async function ensureEnvironment(
  db: AppDatabase,
  projectId: string,
  values: Omit<NewEnvironment, "projectId">,
): Promise<void> {
  const [existing] = await db
    .select({id: environments.id})
    .from(environments)
    .where(and(eq(environments.projectId, projectId), eq(environments.key, values.key)))
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(environments).values({
    projectId,
    ...values,
  });
}

async function main(): Promise<void> {
  const {db, pool} = createDatabase();

  try {
    await db.transaction(async (trx) => {
      const userId = await ensureUser(trx, demoUser);
      const organizationId = await ensureOrganization(trx, demoOrganization);
      const projectId = await ensureProject(trx, organizationId, {
        key: demoProject.key,
        name: demoProject.name,
      });

      await ensureMembership(trx, organizationId, userId, "owner");

      for (const environment of demoEnvironments) {
        await ensureEnvironment(trx, projectId, environment);
      }

      console.info(
        `Seeded demo tenant: org=${demoOrganization.slug} project=${demoProject.key} user=${demoUser.email}`,
      );
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
