import type {FastifyInstance, FastifyReply, FastifyRequest} from "fastify";
import {z} from "zod";
import {
  type AdminUserSummary,
  findAuthorizedProject,
  findUserByEmail,
  findUserById,
  listEnvironmentsForProject,
  listMembershipsForUser,
  listProjectsForOrganization,
} from "../admin/service.js";
import type {ApiConfig} from "../config.js";
import type {ApiDatabase} from "../lib/database.js";
import {clearSessionCookie, createSessionCookie, readSessionUserId} from "../lib/session.js";

const loginBodySchema = z.object({
  email: z.string().email(),
});

const organizationParamsSchema = z.object({
  organizationId: z.string().uuid(),
});

const projectParamsSchema = z.object({
  projectId: z.string().uuid(),
});

type AuthenticatedAdmin = {
  memberships: Awaited<ReturnType<typeof listMembershipsForUser>>;
  user: AdminUserSummary;
};

async function requireAuthenticatedAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<AuthenticatedAdmin | null> {
  const userId = readSessionUserId(
    request.headers.cookie,
    config.sessionCookieName,
    config.sessionSecret,
  );

  if (!userId) {
    await reply.code(401).send({
      error: "UNAUTHENTICATED",
      message: "Admin session is required.",
    });
    return null;
  }

  const user = await findUserById(db, userId);

  if (!user) {
    await reply.code(401).send({
      error: "INVALID_SESSION",
      message: "Admin session is no longer valid.",
    });
    return null;
  }

  const memberships = await listMembershipsForUser(db, user.id);

  return {
    memberships,
    user,
  };
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.post("/api/admin/session/login", async (request, reply) => {
    const parsedBody = loginBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedBody.error.flatten(),
      });
    }

    const user = await findUserByEmail(db, parsedBody.data.email);

    if (!user) {
      return reply.code(401).send({
        error: "INVALID_CREDENTIALS",
        message: "No admin user exists for that email.",
      });
    }

    const memberships = await listMembershipsForUser(db, user.id);

    reply.header(
      "Set-Cookie",
      createSessionCookie(
        config.sessionCookieName,
        user.id,
        config.sessionSecret,
        config.isProduction,
      ),
    );

    return reply.send({
      memberships,
      user,
    });
  });

  app.post("/api/admin/session/logout", async (_, reply) => {
    reply.header("Set-Cookie", clearSessionCookie(config.sessionCookieName, config.isProduction));
    return reply.code(204).send();
  });

  app.get("/api/admin/me", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    return reply.send(admin);
  });

  app.get("/api/admin/organizations", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    return reply.send({
      organizations: admin.memberships,
    });
  });

  app.get("/api/admin/organizations/:organizationId/projects", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = organizationParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const membership = admin.memberships.find(
      (item) => item.organizationId === parsedParams.data.organizationId,
    );

    if (!membership) {
      return reply.code(404).send({
        error: "ORGANIZATION_NOT_FOUND",
        message: "Organization was not found for the current admin.",
      });
    }

    const projects = await listProjectsForOrganization(db, parsedParams.data.organizationId);

    return reply.send({
      organization: membership,
      projects,
    });
  });

  app.get("/api/admin/projects/:projectId/environments", async (request, reply) => {
    const admin = await requireAuthenticatedAdmin(request, reply, db, config);

    if (!admin) {
      return;
    }

    const parsedParams = projectParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        error: "INVALID_REQUEST",
        issues: parsedParams.error.flatten(),
      });
    }

    const project = await findAuthorizedProject(db, parsedParams.data.projectId, admin.user.id);

    if (!project) {
      return reply.code(404).send({
        error: "PROJECT_NOT_FOUND",
        message: "Project was not found for the current admin.",
      });
    }

    const environments = await listEnvironmentsForProject(db, project.id);

    return reply.send({
      environments,
      project,
    });
  });
}
