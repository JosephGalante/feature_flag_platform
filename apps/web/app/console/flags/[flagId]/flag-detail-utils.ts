import type {AdminFlagRule} from "@/lib/admin-api";
import {readSearchParam} from "@/lib/console-hrefs";

type EditableRolloutSlot = {
  id: string;
  rolloutPercentage: number | null;
  variantKey: string;
};

type EditableAttributeSlot = {
  attributeKey: string;
  comparisonValue: string;
  id: string;
  operator: "equals" | "in";
  variantKey: string;
};

type PreviewErrorMessage = {
  error: "invalid_preview_context" | "invalid_preview_json";
};

type PreviewContext = {
  context: Record<string, string>;
};

type PreviewContextResponse = PreviewContext | PreviewErrorMessage;

export function buildEditableRolloutSlots(rules: AdminFlagRule[]): EditableRolloutSlot[] {
  const rolloutRules = rules
    .filter((rule) => rule.ruleType === "percentage_rollout")
    .map((rule) => ({
      id: rule.id,
      rolloutPercentage: rule.rolloutPercentage,
      variantKey: rule.variantKey,
    }));

  return [
    ...rolloutRules,
    {
      id: "new-rollout-rule",
      rolloutPercentage: null,
      variantKey: "",
    },
  ];
}

export function buildEditableAttributeSlots(rules: AdminFlagRule[]): EditableAttributeSlot[] {
  const attributeRules = rules
    .filter((rule) => rule.ruleType === "attribute_match")
    .map((rule) => ({
      attributeKey: rule.attributeKey ?? "",
      comparisonValue: Array.isArray(rule.comparisonValue)
        ? rule.comparisonValue.join(", ")
        : typeof rule.comparisonValue === "string"
          ? rule.comparisonValue
          : "",
      id: rule.id,
      operator: rule.operator === "in" ? ("in" as const) : ("equals" as const),
      variantKey: rule.variantKey,
    }));

  return [
    ...attributeRules,
    {
      attributeKey: "",
      comparisonValue: "",
      id: "new-attribute-rule",
      operator: "equals" as const,
      variantKey: "",
    },
  ];
}

export function readFlagDetailNoticeMessage(value: string | string[] | undefined): string | null {
  switch (readSearchParam(value)) {
    case "flag_created":
      return "Flag created with default variants and environment configurations.";
    case "metadata_saved":
      return "Flag metadata saved.";
    case "flag_archived":
      return "Flag archived.";
    case "environment_saved":
      return "Environment configuration saved.";
    case "no_changes":
      return "No configuration changes were detected.";
    default:
      return null;
  }
}

export function readFlagDetailErrorMessage(value: string | string[] | undefined): string | null {
  switch (readSearchParam(value)) {
    case "flag_not_found":
      return "The flag could not be reloaded before saving.";
    case "invalid_metadata_form":
      return "The submitted metadata form was incomplete.";
    case "invalid_form":
      return "The submitted environment update was incomplete.";
    case "invalid_variant":
      return "The selected default variant is not valid for this flag.";
    case "invalid_attribute_rule":
      return "Each attribute rule needs an attribute key, operator, comparison value, and variant.";
    case "invalid_rollout_rule":
      return "Each rollout rule needs a percentage, a variant, and a value from 0 to 100.";
    case "metadata_save_failed":
      return "The API rejected the metadata update.";
    case "flag_archive_failed":
      return "The API rejected the archive request.";
    case "save_failed":
      return "The API rejected the environment update.";
    case "read_only_demo":
      return "Read-only demo mode is enabled. Flag edits and environment changes are disabled.";
    default:
      return null;
  }
}

export function parsePreviewContext(value: string | null): PreviewContextResponse {
  if (!value || value.trim().length === 0) {
    return {context: {}};
  }

  try {
    const parsed = JSON.parse(value);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {error: "invalid_preview_context"};
    }

    const contextEntries = Object.entries(parsed);

    if (!contextEntries.every(([, entryValue]) => typeof entryValue === "string")) {
      return {error: "invalid_preview_context"};
    }

    return {
      context: Object.fromEntries(contextEntries) as Record<string, string>,
    };
  } catch {
    return {error: "invalid_preview_json"};
  }
}

export function readPreviewErrorMessage(value: string): string {
  switch (value) {
    case "ADMIN_API_UNAVAILABLE":
      return "The admin API is unavailable right now.";
    case "invalid_preview_json":
      return "Preview context must be valid JSON.";
    case "invalid_preview_context":
      return "Preview context must be a JSON object with string values.";
    case "invalid_preview_environment":
      return "Choose a valid environment for the preview.";
    case "PROJECTION_NOT_READY":
      return "Redis does not have a projection for that environment yet.";
    default:
      return "Preview evaluation failed.";
  }
}
