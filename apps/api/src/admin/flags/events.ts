import {
  type ProjectionRefreshJobInput,
  buildProjectionRefreshJobPayload,
} from "../../projections/refresh-jobs";

export function buildProjectionRefreshEvent(input: ProjectionRefreshJobInput) {
  return {
    aggregateId: input.environmentId,
    aggregateType: "environment",
    eventType: "flag_projection_refresh_requested",
    idempotencyKey: `${input.requestId}:${input.featureFlagId}:${input.environmentId}:${input.reason}`,
    payloadJson: buildProjectionRefreshJobPayload(input),
    status: "pending" as const,
  };
}
