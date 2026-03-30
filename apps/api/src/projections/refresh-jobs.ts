import {z} from "zod";

export type ProjectionRefreshJobInput = {
  actorUserId: string;
  environmentId: string;
  featureFlagId: string;
  organizationId: string;
  projectId: string;
  reason: string;
  requestId: string;
};

type ProjectionRefreshJobPayload = {
  environmentId: string;
  featureFlagId: string;
  organizationId: string;
  projectId: string;
  reason: string;
  requestId: string;
  triggeredByUserId: string;
};

const projectionRefreshJobPayloadSchema = z.object({
  environmentId: z.string().uuid(),
  featureFlagId: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  reason: z.string().min(1),
  requestId: z.string().min(1),
  triggeredByUserId: z.string().uuid(),
});

export function buildProjectionRefreshJobPayload(
  input: ProjectionRefreshJobInput,
): ProjectionRefreshJobPayload {
  return {
    environmentId: input.environmentId,
    featureFlagId: input.featureFlagId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    reason: input.reason,
    requestId: input.requestId,
    triggeredByUserId: input.actorUserId,
  };
}

export function readProjectionRefreshJobPayload(
  value: unknown,
): ProjectionRefreshJobPayload | null {
  const parsedPayload = projectionRefreshJobPayloadSchema.safeParse(value);

  return parsedPayload.success ? parsedPayload.data : null;
}
