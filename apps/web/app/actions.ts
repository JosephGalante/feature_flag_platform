"use server";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {
  type AdminFlagRule,
  SESSION_COOKIE_NAME,
  getFlagDetail,
  loginAsAdmin,
  readCookieValue,
  replaceFlagConfiguration,
} from "../lib/admin-api";

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

export async function updateFlagEnvironmentAction(formData: FormData): Promise<void> {
  const flagId = readRequiredField(formData, "flagId");
  const environmentId = readRequiredField(formData, "environmentId");
  const defaultVariantKey = readRequiredField(formData, "defaultVariantKey");
  const enabled = readRequiredField(formData, "enabled") === "true";
  const organizationId = readOptionalField(formData, "organizationId");
  const projectId = readOptionalField(formData, "projectId");
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

  if (!rolloutInput.rules.every((rule) => variantKeys.has(rule.variantKey))) {
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

        const preservedAttributeRules = environmentDetail.rules
          .filter((rule) => rule.ruleType === "attribute_match")
          .map(toConfigurationRuleInput);
        const highestSortOrder = preservedAttributeRules.reduce(
          (maxSortOrder, rule) => Math.max(maxSortOrder, rule.sortOrder),
          0,
        );

        return {
          defaultVariantKey,
          enabled,
          environmentId: environmentDetail.environment.id,
          rules: [
            ...preservedAttributeRules,
            ...rolloutInput.rules.map((rule, index) => ({
              ...rule,
              sortOrder: highestSortOrder + index + 1,
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
