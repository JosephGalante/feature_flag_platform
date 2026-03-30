export const SESSION_COOKIE_NAME = "ff_admin_session";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

type ApiResponse<T> = {
  data: T | null;
  status: number;
};

type AdminMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: "admin" | "developer" | "owner" | "viewer";
};

type AdminUser = {
  email: string;
  id: string;
  name: string;
};

type AuthenticatedAdmin = {
  memberships: AdminMembership[];
  user: AdminUser;
};

type AdminFlagSummary = {
  createdAt: string;
  createdByUserId: string;
  description: string | null;
  flagType: "boolean" | "variant";
  id: string;
  key: string;
  name: string;
  organizationId: string;
  projectId: string;
  status: "active" | "archived";
  updatedAt: string;
};

type AdminProject = {
  createdAt: string;
  id: string;
  key: string;
  name: string;
  organizationId: string;
};

type AdminEnvironment = {
  createdAt: string;
  id: string;
  key: string;
  name: string;
  projectId: string;
  sortOrder: number;
};

export type AdminFlagRule = {
  attributeKey: string | null;
  comparisonValue: unknown;
  createdAt: string;
  id: string;
  operator: string | null;
  rolloutPercentage: number | null;
  ruleType: string;
  sortOrder: number;
  variantKey: string;
};

type AdminFlagVariant = {
  description: string | null;
  id: string;
  key: string;
  value: unknown;
};

type AdminFlagEnvironment = {
  config: {
    defaultVariantKey: string;
    enabled: boolean;
    id: string;
    projectionVersion: number;
    updatedAt: string;
    updatedByUserId: string;
  };
  environment: {
    createdAt: string;
    id: string;
    key: string;
    name: string;
    sortOrder: number;
  };
  rules: AdminFlagRule[];
};

type AdminFlagDetail = {
  environments: AdminFlagEnvironment[];
  flag: AdminFlagSummary;
  variants: AdminFlagVariant[];
};

type AdminApiKeySummary = {
  createdAt: string;
  environmentId: string;
  id: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  name: string;
  organizationId: string;
  projectId: string;
  revokedAt: string | null;
  status: "active" | "revoked";
};

export type AdminAuditLogEntry = {
  action: string;
  actor: {
    email: string;
    id: string;
    name: string;
  };
  after: unknown;
  before: unknown;
  createdAt: string;
  entityId: string;
  entityType: string;
  environmentId: string | null;
  id: string;
  organizationId: string;
  projectId: string | null;
  requestId: string;
};

type AuditLogFilters = {
  createdAfter: string | null;
  createdBefore: string | null;
  entityType: string | null;
  environmentId: string | null;
  projectId: string | null;
};

type AuditLogPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type AttributeMatchConfigurationRuleInput = {
  attributeKey: string;
  comparisonValue: string | string[];
  operator: "equals" | "in";
  ruleType: "attribute_match";
  sortOrder: number;
  variantKey: string;
};

type PercentageRolloutConfigurationRuleInput = {
  rolloutPercentage: number;
  ruleType: "percentage_rollout";
  sortOrder: number;
  variantKey: string;
};

type ConfigurationRuleInput =
  | AttributeMatchConfigurationRuleInput
  | PercentageRolloutConfigurationRuleInput;

type ConfigurationEnvironmentInput = {
  defaultVariantKey: string;
  enabled: boolean;
  environmentId: string;
  rules: ConfigurationRuleInput[];
};

type ConfigurationVariantInput = {
  description: string | null;
  key: string;
  value: unknown;
};

type ProjectsResponse = {
  organization: AdminMembership;
  projects: AdminProject[];
};

type EnvironmentsResponse = {
  environments: AdminEnvironment[];
  project: AdminProject;
};

type FlagsResponse = {
  flags: AdminFlagSummary[];
  project: AdminProject;
};

type CreateFlagResponse = {
  flag: AdminFlagSummary;
};

type FlagDetailResponse = AdminFlagDetail;

type ReplaceFlagConfigurationRequest = {
  environments: ConfigurationEnvironmentInput[];
  variants: ConfigurationVariantInput[];
};

type ReplaceFlagConfigurationResponse = {
  changed: boolean;
  detail: AdminFlagDetail;
};

type UpdateFlagMetadataResponse = {
  flag: AdminFlagSummary;
};

type ApiKeysResponse = {
  apiKeys: AdminApiKeySummary[];
  environment: AdminEnvironment & {organizationId: string};
};

type CreateApiKeyResponse = {
  apiKey: AdminApiKeySummary;
  rawKey: string;
};

type RevokeApiKeyResponse = {
  apiKey: AdminApiKeySummary;
};

type OrganizationAuditLogsResponse = {
  auditLogs: AdminAuditLogEntry[];
  filters: AuditLogFilters;
  organization: AdminMembership;
  pagination: AuditLogPagination;
};

type LoginResponse = {
  memberships: AdminMembership[];
  user: AdminUser;
};

async function parseResponse<T>(response: Response): Promise<ApiResponse<T>> {
  const text = await response.text();
  let data: T | null = null;

  if (text.length > 0) {
    data = JSON.parse(text) as T;
  }

  return {
    data,
    status: response.status,
  };
}

async function apiFetch<T>(
  path: string,
  input: {init?: RequestInit; sessionCookie?: string} = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(input.init?.headers ?? {});

  if (input.sessionCookie) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${input.sessionCookie}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...input.init,
    cache: "no-store",
    headers,
  });

  return parseResponse<T>(response);
}

export async function loginAsAdmin(email: string): Promise<{
  response: LoginResponse | null;
  setCookieHeader: string | null;
  status: number;
}> {
  const response = await fetch(`${API_BASE_URL}/api/admin/session/login`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({email}),
  });

  const payload = await parseResponse<LoginResponse>(response);

  return {
    response: payload.data,
    setCookieHeader: response.headers.get("set-cookie"),
    status: payload.status,
  };
}

export async function getCurrentAdmin(sessionCookie?: string): Promise<AuthenticatedAdmin | null> {
  const response = await apiFetch<AuthenticatedAdmin>("/api/admin/me", {
    ...(sessionCookie !== undefined ? {sessionCookie} : {}),
  });

  if (response.status === 401) {
    return null;
  }

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load current admin.");
  }

  return response.data;
}

export async function getProjectsForOrganization(
  organizationId: string,
  sessionCookie?: string,
): Promise<AdminProject[]> {
  const response = await apiFetch<ProjectsResponse>(
    `/api/admin/organizations/${organizationId}/projects`,
    {
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status === 404) {
    return [];
  }

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load projects.");
  }

  return response.data.projects;
}

export async function getEnvironmentsForProject(
  projectId: string,
  sessionCookie?: string,
): Promise<AdminEnvironment[]> {
  const response = await apiFetch<EnvironmentsResponse>(
    `/api/admin/projects/${projectId}/environments`,
    {
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status === 404) {
    return [];
  }

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load environments.");
  }

  return response.data.environments;
}

export async function getFlagsForProject(
  projectId: string,
  sessionCookie?: string,
): Promise<AdminFlagSummary[]> {
  const response = await apiFetch<FlagsResponse>(`/api/admin/projects/${projectId}/flags`, {
    ...(sessionCookie !== undefined ? {sessionCookie} : {}),
  });

  if (response.status === 404) {
    return [];
  }

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load flags.");
  }

  return response.data.flags;
}

export async function createFlagForProject(
  projectId: string,
  input: {
    description: string | null;
    flagType: "boolean" | "variant";
    key: string;
    name: string;
  },
  sessionCookie?: string,
): Promise<AdminFlagSummary> {
  const response = await apiFetch<CreateFlagResponse>(`/api/admin/projects/${projectId}/flags`, {
    init: {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
    },
    ...(sessionCookie !== undefined ? {sessionCookie} : {}),
  });

  if (response.status === 409) {
    throw new Error("FLAG_KEY_ALREADY_EXISTS");
  }

  if (response.status !== 201 || !response.data) {
    throw new Error("Failed to create flag.");
  }

  return response.data.flag;
}

export async function getFlagDetail(
  flagId: string,
  sessionCookie?: string,
): Promise<AdminFlagDetail | null> {
  const response = await apiFetch<FlagDetailResponse>(`/api/admin/flags/${flagId}`, {
    ...(sessionCookie !== undefined ? {sessionCookie} : {}),
  });

  if (response.status === 404) {
    return null;
  }

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load flag detail.");
  }

  return response.data;
}

export async function updateFlagMetadataById(
  flagId: string,
  input: {
    description?: string | null;
    name?: string;
    status?: "active" | "archived";
  },
  sessionCookie?: string,
): Promise<AdminFlagSummary> {
  const response = await apiFetch<UpdateFlagMetadataResponse>(`/api/admin/flags/${flagId}`, {
    init: {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    },
    ...(sessionCookie !== undefined ? {sessionCookie} : {}),
  });

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to update flag metadata.");
  }

  return response.data.flag;
}

export async function archiveFlagById(
  flagId: string,
  sessionCookie?: string,
): Promise<AdminFlagSummary> {
  const response = await apiFetch<UpdateFlagMetadataResponse>(
    `/api/admin/flags/${flagId}/archive`,
    {
      init: {
        method: "POST",
      },
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to archive flag.");
  }

  return response.data.flag;
}

export async function replaceFlagConfiguration(
  flagId: string,
  input: ReplaceFlagConfigurationRequest,
  sessionCookie?: string,
): Promise<ReplaceFlagConfigurationResponse> {
  const response = await apiFetch<ReplaceFlagConfigurationResponse>(
    `/api/admin/flags/${flagId}/configuration`,
    {
      init: {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      },
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to save flag configuration.");
  }

  return response.data;
}

export async function getApiKeysForEnvironment(
  environmentId: string,
  sessionCookie?: string,
): Promise<AdminApiKeySummary[]> {
  const response = await apiFetch<ApiKeysResponse>(
    `/api/admin/environments/${environmentId}/api-keys`,
    {
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status === 404) {
    return [];
  }

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load API keys.");
  }

  return response.data.apiKeys;
}

export async function createApiKeyForEnvironment(
  environmentId: string,
  name: string,
  sessionCookie?: string,
): Promise<CreateApiKeyResponse> {
  const response = await apiFetch<CreateApiKeyResponse>(
    `/api/admin/environments/${environmentId}/api-keys`,
    {
      init: {
        body: JSON.stringify({name}),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status !== 201 || !response.data) {
    throw new Error("Failed to create API key.");
  }

  return response.data;
}

export async function revokeApiKeyById(
  apiKeyId: string,
  sessionCookie?: string,
): Promise<AdminApiKeySummary> {
  const response = await apiFetch<RevokeApiKeyResponse>(`/api/admin/api-keys/${apiKeyId}/revoke`, {
    init: {
      method: "POST",
    },
    ...(sessionCookie !== undefined ? {sessionCookie} : {}),
  });

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to revoke API key.");
  }

  return response.data.apiKey;
}

export async function getAuditLogsForOrganization(
  organizationId: string,
  input: {
    entityType?: string;
    environmentId?: string;
    page?: number;
    pageSize?: number;
    projectId?: string;
  } = {},
  sessionCookie?: string,
): Promise<OrganizationAuditLogsResponse> {
  const query = new URLSearchParams();

  if (input.projectId) {
    query.set("projectId", input.projectId);
  }

  if (input.environmentId) {
    query.set("environmentId", input.environmentId);
  }

  if (input.entityType) {
    query.set("entityType", input.entityType);
  }

  if (input.page !== undefined) {
    query.set("page", input.page.toString());
  }

  if (input.pageSize !== undefined) {
    query.set("pageSize", input.pageSize.toString());
  }

  const queryString = query.toString();
  const response = await apiFetch<OrganizationAuditLogsResponse>(
    `/api/admin/organizations/${organizationId}/audit-logs${queryString.length > 0 ? `?${queryString}` : ""}`,
    {
      ...(sessionCookie !== undefined ? {sessionCookie} : {}),
    },
  );

  if (response.status !== 200 || !response.data) {
    throw new Error("Failed to load audit logs.");
  }

  return response.data;
}

export function readCookieValue(setCookieHeader: string | null, cookieName: string): string | null {
  if (!setCookieHeader) {
    return null;
  }

  const [cookiePair] = setCookieHeader.split(";", 1);

  if (!cookiePair) {
    return null;
  }

  const separatorIndex = cookiePair.indexOf("=");

  if (separatorIndex === -1) {
    return null;
  }

  const name = cookiePair.slice(0, separatorIndex);
  const value = cookiePair.slice(separatorIndex + 1);

  return name === cookieName && value.length > 0 ? value : null;
}
