import type {NewAuditLog} from "@shared/database";
import type {JsonValue} from "@shared/json";
import type {FlagAuditAction, FlagSummary} from "./flags.service";

export function buildFlagAuditRow(input: {
  action: FlagAuditAction;
  actorUserId: string;
  after: JsonValue | null;
  before: JsonValue | null;
  flagId: string;
  organizationId: string;
  projectId: string;
  requestId: string;
}): NewAuditLog {
  return {
    action: input.action,
    actorUserId: input.actorUserId,
    afterJson: input.after,
    beforeJson: input.before,
    entityId: input.flagId,
    entityType: "feature_flag",
    organizationId: input.organizationId,
    projectId: input.projectId,
    requestId: input.requestId,
  };
}

export function toAuditFlagSnapshot(flag: FlagSummary): JsonValue {
  return {
    createdAt: flag.createdAt.toISOString(),
    createdByUserId: flag.createdByUserId,
    description: flag.description,
    flagType: flag.flagType,
    id: flag.id,
    key: flag.key,
    name: flag.name,
    organizationId: flag.organizationId,
    projectId: flag.projectId,
    status: flag.status,
    updatedAt: flag.updatedAt.toISOString(),
  };
}
