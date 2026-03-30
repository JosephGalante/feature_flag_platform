import {
  archiveFlagAction,
  updateFlagEnvironmentAction,
  updateFlagMetadataAction,
} from "@/app/actions";
import {
  type AdminFlagRule,
  SESSION_COOKIE_NAME,
  getCurrentAdmin,
  getFlagDetail,
} from "@/lib/admin-api";
import type {SearchParams} from "@/lib/types";
import {cookies} from "next/headers";
import Link from "next/link";
import {notFound, redirect} from "next/navigation";

type FlagDetailPageProps = {
  params: Promise<{flagId: string}>;
  searchParams?: Promise<SearchParams>;
};

function readParam(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return null;
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildConsoleHref(input: {
  environmentId: string | null;
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

  const queryString = query.toString();

  return `/console${queryString.length > 0 ? `?${queryString}` : ""}`;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function buildEditableRolloutSlots(rules: AdminFlagRule[]): Array<{
  id: string;
  rolloutPercentage: number | null;
  variantKey: string;
}> {
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

function buildEditableAttributeSlots(rules: AdminFlagRule[]): Array<{
  attributeKey: string;
  comparisonValue: string;
  id: string;
  operator: "equals" | "in";
  variantKey: string;
}> {
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

function readNoticeMessage(value: string | string[] | undefined): string | null {
  switch (readParam(value)) {
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

function readErrorMessage(value: string | string[] | undefined): string | null {
  switch (readParam(value)) {
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
    default:
      return null;
  }
}

export default async function FlagDetailPage({params, searchParams}: FlagDetailPageProps) {
  const [{flagId}, query] = await Promise.all([params, searchParams]);
  const resolvedQuery = query ?? {};
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const admin = await getCurrentAdmin(sessionCookie);

  if (!admin || !sessionCookie) {
    redirect("/login");
  }

  const detail = await getFlagDetail(flagId, sessionCookie);

  if (!detail) {
    notFound();
  }

  const selectedEnvironmentId = readParam(resolvedQuery.environmentId);
  const backHref = buildConsoleHref({
    environmentId: selectedEnvironmentId,
    organizationId: readParam(resolvedQuery.organizationId),
    projectId: readParam(resolvedQuery.projectId),
  });
  const noticeMessage = readNoticeMessage(resolvedQuery.notice);
  const errorMessage = readErrorMessage(resolvedQuery.error);

  return (
    <main className="shell">
      <section className="detail-header">
        <div>
          <p className="eyebrow">Phase 4 / Slice 5</p>
          <h1>{detail.flag.name}</h1>
          <p className="hero-copy">
            Metadata, archive controls, variants, and environment settings are live from the admin
            API on the same page.
          </p>
        </div>
        <div className="detail-actions">
          <Link className="secondary-button detail-back-link" href={backHref}>
            Back to console
          </Link>
        </div>
      </section>

      {noticeMessage ? (
        <p className="detail-feedback detail-feedback-success">{noticeMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="detail-feedback detail-feedback-error">{errorMessage}</p>
      ) : null}

      <section className="summary-grid">
        <article className="panel stat-card">
          <p className="eyebrow">Key</p>
          <strong>{detail.flag.key}</strong>
          <span>{detail.flag.description ?? "No description yet."}</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Type</p>
          <strong>{detail.flag.flagType}</strong>
          <span>
            <span className={`status-pill status-${detail.flag.status}`}>{detail.flag.status}</span>
          </span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Updated</p>
          <strong>{formatTimestamp(detail.flag.updatedAt)}</strong>
          <span>Created {formatTimestamp(detail.flag.createdAt)}</span>
        </article>
      </section>

      <section className="panel detail-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Metadata</p>
            <h2>Identity and lifecycle</h2>
          </div>
        </div>

        <div className="detail-stack">
          <section className="detail-block">
            <div className="detail-block-header">
              <div>
                <h3>Edit flag metadata</h3>
                <p>
                  Update the display name and optional description without touching configuration.
                </p>
              </div>
            </div>

            <form action={updateFlagMetadataAction} className="metadata-form">
              <input name="flagId" type="hidden" value={detail.flag.id} />
              <input
                name="organizationId"
                type="hidden"
                value={readParam(resolvedQuery.organizationId) ?? ""}
              />
              <input
                name="projectId"
                type="hidden"
                value={readParam(resolvedQuery.projectId) ?? ""}
              />
              <input
                name="environmentId"
                type="hidden"
                value={readParam(resolvedQuery.environmentId) ?? ""}
              />

              <div className="metadata-form-grid">
                <label className="context-field">
                  <span>Name</span>
                  <input defaultValue={detail.flag.name} name="name" type="text" />
                </label>

                <label className="context-field">
                  <span>Description</span>
                  <input
                    defaultValue={detail.flag.description ?? ""}
                    name="description"
                    placeholder="No description yet."
                    type="text"
                  />
                </label>
              </div>

              <div className="metadata-form-actions">
                <button className="primary-button create-button" type="submit">
                  Save metadata
                </button>
              </div>
            </form>
          </section>

          <section className="detail-block">
            <div className="detail-block-header">
              <div>
                <h3>Archive flag</h3>
                <p>
                  Archiving keeps the flag visible for audit history but marks it inactive across
                  the control plane.
                </p>
              </div>
            </div>

            <div className="metadata-archive-row">
              <p className="detail-inline-meta">
                Current status{" "}
                <span className={`status-pill status-${detail.flag.status}`}>
                  {detail.flag.status}
                </span>
              </p>

              {detail.flag.status === "archived" ? (
                <span className="table-link-button is-disabled">Already archived</span>
              ) : (
                <form action={archiveFlagAction}>
                  <input name="flagId" type="hidden" value={detail.flag.id} />
                  <input
                    name="organizationId"
                    type="hidden"
                    value={readParam(resolvedQuery.organizationId) ?? ""}
                  />
                  <input
                    name="projectId"
                    type="hidden"
                    value={readParam(resolvedQuery.projectId) ?? ""}
                  />
                  <input
                    name="environmentId"
                    type="hidden"
                    value={readParam(resolvedQuery.environmentId) ?? ""}
                  />
                  <button className="table-link-button danger-button" type="submit">
                    Archive flag
                  </button>
                </form>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="detail-grid">
        <article className="panel detail-panel">
          <div className="table-header">
            <div>
              <p className="eyebrow">Variants</p>
              <h2>Resolution values</h2>
            </div>
          </div>

          <div className="detail-stack">
            {detail.variants.map((variant) => (
              <section className="detail-block" key={variant.id}>
                <div className="detail-block-header">
                  <div>
                    <h3>{variant.key}</h3>
                    <p>{variant.description ?? "No variant description."}</p>
                  </div>
                </div>
                <pre className="json-block">{formatJson(variant.value)}</pre>
              </section>
            ))}
          </div>
        </article>

        <article className="panel detail-panel">
          <div className="table-header">
            <div>
              <p className="eyebrow">Environments</p>
              <h2>Configuration by environment</h2>
            </div>
          </div>

          <div className="detail-stack">
            {detail.environments.map((environmentDetail) => {
              const attributeSlots = buildEditableAttributeSlots(environmentDetail.rules);
              const rolloutSlots = buildEditableRolloutSlots(environmentDetail.rules);

              return (
                <section
                  className={`detail-block environment-card${
                    selectedEnvironmentId === environmentDetail.environment.id ? " is-selected" : ""
                  }`}
                  key={environmentDetail.config.id}
                >
                  <div className="detail-block-header">
                    <div>
                      <h3>
                        {environmentDetail.environment.name}{" "}
                        <span className="detail-inline-meta">
                          ({environmentDetail.environment.key})
                        </span>
                      </h3>
                      <p>
                        {environmentDetail.config.enabled ? "Enabled" : "Disabled"} · default{" "}
                        {environmentDetail.config.defaultVariantKey} · projection v
                        {environmentDetail.config.projectionVersion}
                      </p>
                    </div>
                    <p className="detail-inline-meta">
                      Updated {formatTimestamp(environmentDetail.config.updatedAt)}
                    </p>
                  </div>

                  <form action={updateFlagEnvironmentAction} className="environment-form">
                    <input name="flagId" type="hidden" value={detail.flag.id} />
                    <input
                      name="organizationId"
                      type="hidden"
                      value={readParam(resolvedQuery.organizationId) ?? ""}
                    />
                    <input
                      name="projectId"
                      type="hidden"
                      value={readParam(resolvedQuery.projectId) ?? ""}
                    />
                    <input
                      name="environmentId"
                      type="hidden"
                      value={environmentDetail.environment.id}
                    />

                    <div className="environment-form-grid">
                      <label className="context-field">
                        <span>State</span>
                        <select
                          defaultValue={environmentDetail.config.enabled ? "true" : "false"}
                          name="enabled"
                        >
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      </label>

                      <label className="context-field">
                        <span>Default variant</span>
                        <select
                          defaultValue={environmentDetail.config.defaultVariantKey}
                          name="defaultVariantKey"
                        >
                          {detail.variants.map((variant) => (
                            <option key={variant.id} value={variant.key}>
                              {variant.key}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="rule-editor">
                      <div>
                        <p className="eyebrow">Attribute Rules</p>
                        <p className="detail-inline-meta">
                          Use commas for the <code>in</code> operator, for example{" "}
                          <code>us, ca, mx</code>.
                        </p>
                      </div>

                      <div className="attribute-list">
                        {attributeSlots.map((rule, index) => (
                          <div className="attribute-row" key={rule.id}>
                            <label className="context-field">
                              <span>
                                {index < attributeSlots.length - 1
                                  ? `Rule ${index + 1}`
                                  : "New rule"}
                              </span>
                              <input
                                defaultValue={rule.attributeKey}
                                name="attributeKey"
                                placeholder="country"
                                type="text"
                              />
                            </label>

                            <label className="context-field">
                              <span>Operator</span>
                              <select defaultValue={rule.operator} name="attributeOperator">
                                <option value="equals">equals</option>
                                <option value="in">in</option>
                              </select>
                            </label>

                            <label className="context-field">
                              <span>Comparison</span>
                              <input
                                defaultValue={rule.comparisonValue}
                                name="attributeComparisonValue"
                                placeholder="us or us, ca"
                                type="text"
                              />
                            </label>

                            <label className="context-field">
                              <span>Variant</span>
                              <select defaultValue={rule.variantKey} name="attributeVariantKey">
                                <option value="">No rule</option>
                                {detail.variants.map((variant) => (
                                  <option key={variant.id} value={variant.key}>
                                    {variant.key}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rule-editor">
                      <div>
                        <p className="eyebrow">Percentage Rollout</p>
                        <p className="detail-inline-meta">
                          Existing rollout rules stay editable here. Leave the extra row blank if
                          you do not want to add another rule.
                        </p>
                      </div>

                      <div className="rollout-list">
                        {rolloutSlots.map((rule, index) => (
                          <div className="rollout-row" key={rule.id}>
                            <label className="context-field">
                              <span>
                                {index < rolloutSlots.length - 1 ? `Rule ${index + 1}` : "New rule"}
                              </span>
                              <input
                                defaultValue={rule.rolloutPercentage ?? ""}
                                max="100"
                                min="0"
                                name="rolloutPercentage"
                                placeholder="0-100"
                                type="number"
                              />
                            </label>

                            <label className="context-field">
                              <span>Variant</span>
                              <select defaultValue={rule.variantKey} name="rolloutVariantKey">
                                <option value="">No rule</option>
                                {detail.variants.map((variant) => (
                                  <option key={variant.id} value={variant.key}>
                                    {variant.key}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button className="primary-button environment-save-button" type="submit">
                      Save environment
                    </button>
                  </form>

                  {environmentDetail.rules.length === 0 ? (
                    <p className="empty-inline">
                      No targeting rules. This environment falls back to its default variant.
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        </article>
      </section>
    </main>
  );
}
