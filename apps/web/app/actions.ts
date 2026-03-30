"use server";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {
  type AdminFlagRule,
  SESSION_COOKIE_NAME,
  archiveFlagById,
  createApiKeyForEnvironment,
  createFlagForProject,
  getFlagDetail,
  loginAsAdmin,
  readCookieValue,
  replaceFlagConfiguration,
  revokeApiKeyById,
  updateFlagMetadataById,
} from "../lib/admin-api";
import {API_KEY_FLASH_COOKIE_NAME, encodeApiKeyFlash} from "../lib/api-key-flash";

function readEmail(formData: FormData): string {
  const rawValue = formData.get("email");
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function readRequiredField(formData: FormData, key: string): string {
  const rawValue = formData.get(key);
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

function readOptionalField(formData: FormData, key: string): string | null {
  const value = readRequiredField(formData, key);
  return value.length > 0 ? value : null;
}

function readStringEntries(formData: FormData, key: string): string[] {
  return formData.getAll(key).map((value) => (typeof value === "string" ? value.trim() : ""));
}

function buildFlagDetailHref(input: {
  environmentId: string | null;
  error?: string;
  flagId: string;
  notice?: string;
  organizationId: string | null;
  projectId: string | null;
}): string {
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

  return `/console/flags/${input.flagId}${queryString.length > 0 ? `?${queryString}` : ""}`;
}

function buildApiKeysHref(input: {
  environmentId: string | null;
  error?: string;
  notice?: string;
  organizationId: string | null;
  projectId: string | null;
}): string {
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

  return `/console/api-keys${queryString.length > 0 ? `?${queryString}` : ""}`;
}

function buildConsoleHref(input: {
  environmentId: string | null;
  error?: string;
  notice?: string;
  organizationId: string | null;
  projectId: string | null;
}): string {
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

  return `/console${queryString.length > 0 ? `?${queryString}` : ""}`;
}

function toConfigurationRuleInput(rule: AdminFlagRule) {
  if (rule.ruleType === "attribute_match") {
    if (typeof rule.attributeKey !== "string") {
      throw new Error("Attribute match rule is missing attributeKey.");
    }

    if (rule.operator !== "equals" && rule.operator !== "in") {
      throw new Error("Attribute match rule has unsupported operator.");
    }

    if (
      typeof rule.comparisonValue !== "string" &&
      !(
        Array.isArray(rule.comparisonValue) &&
        rule.comparisonValue.every((value) => typeof value === "string")
      )
    ) {
      throw new Error("Attribute match rule has invalid comparisonValue.");
    }

    return {
      attributeKey: rule.attributeKey,
      comparisonValue: rule.comparisonValue,
      operator: rule.operator as "equals" | "in",
      ruleType: "attribute_match" as const,
      sortOrder: rule.sortOrder,
      variantKey: rule.variantKey,
    };
  }

  if (rule.ruleType === "percentage_rollout") {
    if (typeof rule.rolloutPercentage !== "number") {
      throw new Error("Percentage rollout rule is missing rolloutPercentage.");
    }

    return {
      rolloutPercentage: rule.rolloutPercentage,
      ruleType: "percentage_rollout" as const,
      sortOrder: rule.sortOrder,
      variantKey: rule.variantKey,
    };
  }

  throw new Error(`Unsupported rule type '${rule.ruleType}'.`);
}

function readPercentageRolloutRules(formData: FormData):
  | {
      rules: Array<{
        rolloutPercentage: number;
        ruleType: "percentage_rollout";
        variantKey: string;
      }>;
    }
  | {error: "invalid_rollout_rule"} {
  const percentages = readStringEntries(formData, "rolloutPercentage");
  const variantKeys = readStringEntries(formData, "rolloutVariantKey");
  const rules: Array<{
    rolloutPercentage: number;
    ruleType: "percentage_rollout";
    variantKey: string;
  }> = [];
  const entryCount = Math.max(percentages.length, variantKeys.length);

  for (let index = 0; index < entryCount; index += 1) {
    const percentageValue = percentages[index] ?? "";
    const variantKey = variantKeys[index] ?? "";

    if (percentageValue.length === 0 && variantKey.length === 0) {
      continue;
    }

    if (percentageValue.length === 0 || variantKey.length === 0) {
      return {error: "invalid_rollout_rule"};
    }

    const rolloutPercentage = Number(percentageValue);

    if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
      return {error: "invalid_rollout_rule"};
    }

    rules.push({
      rolloutPercentage,
      ruleType: "percentage_rollout",
      variantKey,
    });
  }

  return {rules};
}

function readAttributeMatchRules(formData: FormData):
  | {
      rules: Array<{
        attributeKey: string;
        comparisonValue: string | string[];
        operator: "equals" | "in";
        ruleType: "attribute_match";
        variantKey: string;
      }>;
    }
  | {error: "invalid_attribute_rule"} {
  const attributeKeys = readStringEntries(formData, "attributeKey");
  const operators = readStringEntries(formData, "attributeOperator");
  const comparisonValues = readStringEntries(formData, "attributeComparisonValue");
  const variantKeys = readStringEntries(formData, "attributeVariantKey");
  const rules: Array<{
    attributeKey: string;
    comparisonValue: string | string[];
    operator: "equals" | "in";
    ruleType: "attribute_match";
    variantKey: string;
  }> = [];
  const entryCount = Math.max(
    attributeKeys.length,
    operators.length,
    comparisonValues.length,
    variantKeys.length,
  );

  for (let index = 0; index < entryCount; index += 1) {
    const attributeKey = attributeKeys[index] ?? "";
    const operator = operators[index] ?? "equals";
    const comparisonValue = comparisonValues[index] ?? "";
    const variantKey = variantKeys[index] ?? "";

    if (attributeKey.length === 0 && comparisonValue.length === 0 && variantKey.length === 0) {
      continue;
    }

    if (
      attributeKey.length === 0 ||
      comparisonValue.length === 0 ||
      variantKey.length === 0 ||
      (operator !== "equals" && operator !== "in")
    ) {
      return {error: "invalid_attribute_rule"};
    }

    const parsedComparisonValue =
      operator === "equals"
        ? comparisonValue
        : comparisonValue
            .split(",")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);

    if (operator === "in" && parsedComparisonValue.length === 0) {
      return {error: "invalid_attribute_rule"};
    }

    rules.push({
      attributeKey,
      comparisonValue: parsedComparisonValue,
      operator,
      ruleType: "attribute_match",
      variantKey,
    });
  }

  return {rules};
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = readEmail(formData);

  if (email.length === 0) {
    redirect("/login?error=missing_email");
  }

  const result = await loginAsAdmin(email).catch(() => {
    redirect("/login?error=api_unavailable");
  });

  if (result.status === 401) {
    redirect("/login?error=invalid_credentials");
  }

  if (result.status !== 200) {
    redirect("/login?error=api_unavailable");
  }

  const cookieValue = readCookieValue(result.setCookieHeader, SESSION_COOKIE_NAME);

  if (!cookieValue) {
    redirect("/login?error=session_cookie_missing");
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/console");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}

export async function createFlagAction(formData: FormData): Promise<void> {
  const projectId = readRequiredField(formData, "projectId");
  const organizationId = readOptionalField(formData, "organizationId");
  const environmentId = readOptionalField(formData, "environmentId");
  const key = readRequiredField(formData, "key");
  const name = readRequiredField(formData, "name");
  const description = readOptionalField(formData, "description");
  const rawFlagType = readRequiredField(formData, "flagType");
  const flagType =
    rawFlagType === "variant" ? "variant" : rawFlagType === "boolean" ? "boolean" : null;

  if (projectId.length === 0 || key.length === 0 || name.length === 0 || flagType === null) {
    redirect(
      buildConsoleHref({
        environmentId,
        error: "invalid_flag_form",
        organizationId,
        projectId: projectId || null,
      }),
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  const createdFlag = await createFlagForProject(
    projectId,
    {
      description,
      flagType,
      key,
      name,
    },
    sessionCookie,
  ).catch((error: unknown) => {
    redirect(
      buildConsoleHref({
        environmentId,
        error:
          error instanceof Error && error.message === "FLAG_KEY_ALREADY_EXISTS"
            ? "duplicate_flag_key"
            : "flag_create_failed",
        organizationId,
        projectId,
      }),
    );
  });

  redirect(
    buildFlagDetailHref({
      environmentId,
      flagId: createdFlag.id,
      notice: "flag_created",
      organizationId,
      projectId,
    }),
  );
}

export async function createApiKeyAction(formData: FormData): Promise<void> {
  const environmentId = readRequiredField(formData, "environmentId");
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");
  const name = readRequiredField(formData, "name");

  if (environmentId.length === 0 || name.length === 0) {
    redirect(
      buildApiKeysHref({
        environmentId: environmentId || null,
        error: "invalid_form",
        organizationId,
        projectId,
      }),
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  const result = await createApiKeyForEnvironment(environmentId, name, sessionCookie).catch(() => {
    redirect(
      buildApiKeysHref({
        environmentId,
        error: "api_key_create_failed",
        organizationId,
        projectId,
      }),
    );
  });

  cookieStore.set({
    httpOnly: true,
    maxAge: 300,
    name: API_KEY_FLASH_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: encodeApiKeyFlash({
      keyPrefix: result.apiKey.keyPrefix,
      name: result.apiKey.name,
      rawKey: result.rawKey,
    }),
  });

  redirect(
    buildApiKeysHref({
      environmentId,
      notice: "api_key_created",
      organizationId,
      projectId,
    }),
  );
}

export async function revokeApiKeyAction(formData: FormData): Promise<void> {
  const apiKeyId = readRequiredField(formData, "apiKeyId");
  const environmentId = readRequiredField(formData, "environmentId");
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");

  if (apiKeyId.length === 0 || environmentId.length === 0) {
    redirect(
      buildApiKeysHref({
        environmentId: environmentId || null,
        error: "invalid_form",
        organizationId,
        projectId,
      }),
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  await revokeApiKeyById(apiKeyId, sessionCookie).catch(() => {
    redirect(
      buildApiKeysHref({
        environmentId,
        error: "api_key_revoke_failed",
        organizationId,
        projectId,
      }),
    );
  });

  redirect(
    buildApiKeysHref({
      environmentId,
      notice: "api_key_revoked",
      organizationId,
      projectId,
    }),
  );
}

export async function updateFlagMetadataAction(formData: FormData): Promise<void> {
  const flagId = readRequiredField(formData, "flagId");
  const environmentId = readOptionalField(formData, "environmentId");
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");
  const name = readRequiredField(formData, "name");
  const description = readOptionalField(formData, "description");

  if (flagId.length === 0 || name.length === 0) {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "invalid_metadata_form",
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  await updateFlagMetadataById(
    flagId,
    {
      description,
      name,
    },
    sessionCookie,
  ).catch(() => {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "metadata_save_failed",
        flagId,
        organizationId,
        projectId,
      }),
    );
  });

  redirect(
    buildFlagDetailHref({
      environmentId,
      flagId,
      notice: "metadata_saved",
      organizationId,
      projectId,
    }),
  );
}

export async function archiveFlagAction(formData: FormData): Promise<void> {
  const flagId = readRequiredField(formData, "flagId");
  const environmentId = readOptionalField(formData, "environmentId");
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");

  if (flagId.length === 0) {
    redirect(
      buildConsoleHref({
        environmentId,
        error: "flag_archive_failed",
        organizationId,
        projectId,
      }),
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  await archiveFlagById(flagId, sessionCookie).catch(() => {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "flag_archive_failed",
        flagId,
        organizationId,
        projectId,
      }),
    );
  });

  redirect(
    buildFlagDetailHref({
      environmentId,
      flagId,
      notice: "flag_archived",
      organizationId,
      projectId,
    }),
  );
}

export async function dismissApiKeyFlashAction(formData: FormData): Promise<void> {
  const environmentId = readOptionalField(formData, "environmentId");
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");
  const cookieStore = await cookies();

  cookieStore.delete(API_KEY_FLASH_COOKIE_NAME);

  redirect(
    buildApiKeysHref({
      environmentId,
      organizationId,
      projectId,
    }),
  );
}

export async function updateFlagEnvironmentAction(formData: FormData): Promise<void> {
  const flagId = readRequiredField(formData, "flagId");
  const environmentId = readRequiredField(formData, "environmentId");
  const defaultVariantKey = readRequiredField(formData, "defaultVariantKey");
  const enabled = readRequiredField(formData, "enabled") === "true";
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");
  const attributeInput = readAttributeMatchRules(formData);
  const rolloutInput = readPercentageRolloutRules(formData);

  if (flagId.length === 0 || environmentId.length === 0 || defaultVariantKey.length === 0) {
    redirect(
      buildFlagDetailHref({
        environmentId: environmentId || null,
        error: "invalid_form",
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  if ("error" in rolloutInput) {
    redirect(
      buildFlagDetailHref({
        environmentId: environmentId || null,
        error: rolloutInput.error,
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  if ("error" in attributeInput) {
    redirect(
      buildFlagDetailHref({
        environmentId: environmentId || null,
        error: attributeInput.error,
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  const currentDetail = await getFlagDetail(flagId, sessionCookie).catch(() => null);

  if (!currentDetail) {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "flag_not_found",
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  if (!currentDetail.variants.some((variant) => variant.key === defaultVariantKey)) {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "invalid_variant",
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  const variantKeys = new Set(currentDetail.variants.map((variant) => variant.key));

  if (
    !rolloutInput.rules.every((rule) => variantKeys.has(rule.variantKey)) ||
    !attributeInput.rules.every((rule) => variantKeys.has(rule.variantKey))
  ) {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "invalid_variant",
        flagId,
        organizationId,
        projectId,
      }),
    );
  }

  const result = await replaceFlagConfiguration(
    flagId,
    {
      environments: currentDetail.environments.map((environmentDetail) => {
        if (environmentDetail.environment.id !== environmentId) {
          return {
            defaultVariantKey: environmentDetail.config.defaultVariantKey,
            enabled: environmentDetail.config.enabled,
            environmentId: environmentDetail.environment.id,
            rules: environmentDetail.rules.map(toConfigurationRuleInput),
          };
        }

        return {
          defaultVariantKey,
          enabled,
          environmentId: environmentDetail.environment.id,
          rules: [
            ...attributeInput.rules.map((rule, index) => ({
              ...rule,
              sortOrder: index + 1,
            })),
            ...rolloutInput.rules.map((rule, index) => ({
              ...rule,
              sortOrder: attributeInput.rules.length + index + 1,
            })),
          ],
        };
      }),
      variants: currentDetail.variants.map((variant) => ({
        description: variant.description,
        key: variant.key,
        value: variant.value,
      })),
    },
    sessionCookie,
  ).catch(() => {
    redirect(
      buildFlagDetailHref({
        environmentId,
        error: "save_failed",
        flagId,
        organizationId,
        projectId,
      }),
    );
  });

  redirect(
    buildFlagDetailHref({
      environmentId,
      flagId,
      notice: result.changed ? "environment_saved" : "no_changes",
      organizationId,
      projectId,
    }),
  );
}
