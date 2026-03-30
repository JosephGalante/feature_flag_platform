export function buildProjectionRefreshEvent(input: {
  actorUserId: string;
  environmentId: string;
  featureFlagId: string;
  organizationId: string;
  projectId: string;
  reason: string;
  requestId: string;
}) {
  return {
    aggregateId: input.environmentId,
    aggregateType: "environment",
    eventType: "flag_projection_refresh_requested",
    idempotencyKey: `${input.requestId}:${input.featureFlagId}:${input.environmentId}:${input.reason}`,
    payloadJson: {
      environmentId: input.environmentId,
      featureFlagId: input.featureFlagId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      reason: input.reason,
      triggeredByUserId: input.actorUserId,
    },
    status: "pending" as const,
  };
}
