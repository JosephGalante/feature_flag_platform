export type ConsoleContextQuery = {
  environmentId: string | null;
  organizationId: string | null;
  projectId: string | null;
};

type ConsoleFeedbackQuery = {
  error?: string;
  notice?: string;
};

type ConsoleQueryInput = ConsoleContextQuery & ConsoleFeedbackQuery;

export function readSearchParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

function buildConsoleQuerySuffix(input: ConsoleQueryInput): string {
  const query = new URLSearchParams();

  if (input.organizationId) {
    query.set("organizationId", input.organizationId);
  }

  if (input.projectId) {
    query.set("projectId", input.projectId);
  }

  if (input.environmentId) {
    query.set("environmentId", input.environmentId);
  }

  if (input.notice) {
    query.set("notice", input.notice);
  }

  if (input.error) {
    query.set("error", input.error);
  }

  const queryString = query.toString();

  return queryString.length > 0 ? `?${queryString}` : "";
}

export function buildConsoleHref(input: ConsoleQueryInput): string {
  return `/console${buildConsoleQuerySuffix(input)}`;
}

export function buildApiKeysHref(input: ConsoleQueryInput): string {
  return `/console/api-keys${buildConsoleQuerySuffix(input)}`;
}

export function buildFlagDetailHref(input: ConsoleQueryInput & {flagId: string}): string {
  return `/console/flags/${input.flagId}${buildConsoleQuerySuffix(input)}`;
}

export function buildAuditLogsHref(
  input: ConsoleQueryInput & {
    entityType?: string | null;
    page?: number;
  },
): string {
  const query = new URLSearchParams();

  if (input.organizationId) {
    query.set("organizationId", input.organizationId);
  }

  if (input.projectId) {
    query.set("projectId", input.projectId);
  }

  if (input.environmentId) {
    query.set("environmentId", input.environmentId);
  }

  if (input.entityType) {
    query.set("entityType", input.entityType);
  }

  if (input.page !== undefined && input.page > 1) {
    query.set("page", input.page.toString());
  }

  const queryString = query.toString();

  return `/console/audit-logs${queryString.length > 0 ? `?${queryString}` : ""}`;
}
