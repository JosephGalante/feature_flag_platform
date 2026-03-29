import type {MembershipRole} from "@shared/database";
import type {FastifyReply, FastifyRequest} from "fastify";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";
import {readSessionUserId} from "../lib/session";
import {
  type AdminMembershipSummary,
  type AdminUserSummary,
  findUserById,
  listMembershipsForUser,
} from "./service";

const WRITE_ROLES = new Set<MembershipRole>(["owner", "admin", "developer"]);

type AuthenticatedAdmin = {
  memberships: AdminMembershipSummary[];
  user: AdminUserSummary;
};

export async function requireAuthenticatedAdmin(
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

export function getOrganizationMembership(
  admin: AuthenticatedAdmin,
  organizationId: string,
): AdminMembershipSummary | null {
  return admin.memberships.find((item) => item.organizationId === organizationId) ?? null;
}

export async function requireOrganizationWriteAccess(
  admin: AuthenticatedAdmin,
  organizationId: string,
  reply: FastifyReply,
): Promise<boolean> {
  const membership = getOrganizationMembership(admin, organizationId);

  if (!membership) {
    await reply.code(404).send({
      error: "ORGANIZATION_NOT_FOUND",
      message: "Organization was not found for the current admin.",
    });
    return false;
  }

  if (!WRITE_ROLES.has(membership.role)) {
    await reply.code(403).send({
      error: "FORBIDDEN",
      message: "Current admin role is read-only for this organization.",
    });
    return false;
  }

  return true;
}
