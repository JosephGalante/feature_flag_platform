import {
  archiveFlagAction,
  updateFlagEnvironmentAction,
  updateFlagMetadataAction,
} from "@/app/actions";
import type {AdminPreviewEvaluationResult, getFlagDetail} from "@/lib/admin-api";
import type {ConsoleContextQuery} from "@/lib/console-hrefs";
import Link from "next/link";
import {
  buildEditableAttributeSlots,
  buildEditableRolloutSlots,
  formatJson,
  formatTimestamp,
} from "./flag-detail-utils";

type FlagDetail = NonNullable<Awaited<ReturnType<typeof getFlagDetail>>>;
type FlagEnvironmentDetail = FlagDetail["environments"][number];
type FlagVariantDetail = FlagDetail["variants"][number];

function ConsoleContextHiddenInputs(input: ConsoleContextQuery) {
  return (
    <>
      <input name="organizationId" type="hidden" value={input.organizationId ?? ""} />
      <input name="projectId" type="hidden" value={input.projectId ?? ""} />
      <input name="environmentId" type="hidden" value={input.environmentId ?? ""} />
    </>
  );
}

export function FlagDetailHeader(input: {
  backHref: string;
  errorMessage: string | null;
  name: string;
  noticeMessage: string | null;
}) {
  return (
    <>
      <section className="detail-header">
        <div>
          <p className="eyebrow">Phase 4 / Slice 5</p>
          <h1>{input.name}</h1>
          <p className="hero-copy">
            Metadata, archive controls, variants, and environment settings are live from the admin
            API on the same page.
          </p>
        </div>
        <div className="detail-actions">
          <Link className="secondary-button detail-back-link" href={input.backHref}>
            Back to console
          </Link>
        </div>
      </section>

      {input.noticeMessage ? (
        <p className="detail-feedback detail-feedback-success">{input.noticeMessage}</p>
      ) : null}
      {input.errorMessage ? (
        <p className="detail-feedback detail-feedback-error">{input.errorMessage}</p>
      ) : null}
    </>
  );
}

export function FlagSummaryCards(input: {
  flag: FlagDetail["flag"];
}) {
  return (
    <section className="summary-grid">
      <article className="panel stat-card">
        <p className="eyebrow">Key</p>
        <strong>{input.flag.key}</strong>
        <span>{input.flag.description ?? "No description yet."}</span>
      </article>
      <article className="panel stat-card">
        <p className="eyebrow">Type</p>
        <strong>{input.flag.flagType}</strong>
        <span>
          <span className={`status-pill status-${input.flag.status}`}>{input.flag.status}</span>
        </span>
      </article>
      <article className="panel stat-card">
        <p className="eyebrow">Updated</p>
        <strong>{formatTimestamp(input.flag.updatedAt)}</strong>
        <span>Created {formatTimestamp(input.flag.createdAt)}</span>
      </article>
    </section>
  );
}

export function FlagMetadataPanel(input: {
  flag: FlagDetail["flag"];
  routeContext: ConsoleContextQuery;
}) {
  return (
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
            <input name="flagId" type="hidden" value={input.flag.id} />
            <ConsoleContextHiddenInputs {...input.routeContext} />

            <div className="metadata-form-grid">
              <label className="context-field">
                <span>Name</span>
                <input defaultValue={input.flag.name} name="name" type="text" />
              </label>

              <label className="context-field">
                <span>Description</span>
                <input
                  defaultValue={input.flag.description ?? ""}
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
                Archiving keeps the flag visible for audit history but marks it inactive across the
                control plane.
              </p>
            </div>
          </div>

          <div className="metadata-archive-row">
            <p className="detail-inline-meta">
              Current status{" "}
              <span className={`status-pill status-${input.flag.status}`}>{input.flag.status}</span>
            </p>

            {input.flag.status === "archived" ? (
              <span className="table-link-button is-disabled">Already archived</span>
            ) : (
              <form action={archiveFlagAction}>
                <input name="flagId" type="hidden" value={input.flag.id} />
                <ConsoleContextHiddenInputs {...input.routeContext} />
                <button className="table-link-button danger-button" type="submit">
                  Archive flag
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export function FlagVariantsPanel(input: {
  variants: FlagVariantDetail[];
}) {
  return (
    <article className="panel detail-panel">
      <div className="table-header">
        <div>
          <p className="eyebrow">Variants</p>
          <h2>Resolution values</h2>
        </div>
      </div>

      <div className="detail-stack">
        {input.variants.map((variant) => (
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
  );
}

function EnvironmentCard(input: {
  environmentDetail: FlagEnvironmentDetail;
  flagId: string;
  routeContext: Omit<ConsoleContextQuery, "environmentId">;
  selectedEnvironmentId: string | null;
  variants: FlagVariantDetail[];
}) {
  const attributeSlots = buildEditableAttributeSlots(input.environmentDetail.rules);
  const rolloutSlots = buildEditableRolloutSlots(input.environmentDetail.rules);

  return (
    <section
      className={`detail-block environment-card${
        input.selectedEnvironmentId === input.environmentDetail.environment.id ? " is-selected" : ""
      }`}
      key={input.environmentDetail.config.id}
    >
      <div className="detail-block-header">
        <div>
          <h3>
            {input.environmentDetail.environment.name}{" "}
            <span className="detail-inline-meta">({input.environmentDetail.environment.key})</span>
          </h3>
          <p>
            {input.environmentDetail.config.enabled ? "Enabled" : "Disabled"} · default{" "}
            {input.environmentDetail.config.defaultVariantKey} · projection v
            {input.environmentDetail.config.projectionVersion}
          </p>
        </div>
        <p className="detail-inline-meta">
          Updated {formatTimestamp(input.environmentDetail.config.updatedAt)}
        </p>
      </div>

      <form action={updateFlagEnvironmentAction} className="environment-form">
        <input name="flagId" type="hidden" value={input.flagId} />
        <ConsoleContextHiddenInputs
          environmentId={input.environmentDetail.environment.id}
          organizationId={input.routeContext.organizationId}
          projectId={input.routeContext.projectId}
        />

        <div className="environment-form-grid">
          <label className="context-field">
            <span>State</span>
            <select
              defaultValue={input.environmentDetail.config.enabled ? "true" : "false"}
              name="enabled"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>

          <label className="context-field">
            <span>Default variant</span>
            <select
              defaultValue={input.environmentDetail.config.defaultVariantKey}
              name="defaultVariantKey"
            >
              {input.variants.map((variant) => (
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
              Use commas for the <code>in</code> operator, for example <code>us, ca, mx</code>.
            </p>
          </div>

          <div className="attribute-list">
            {attributeSlots.map((rule, index) => (
              <div className="attribute-row" key={rule.id}>
                <label className="context-field">
                  <span>
                    {index < attributeSlots.length - 1 ? `Rule ${index + 1}` : "New rule"}
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
                    {input.variants.map((variant) => (
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
              Existing rollout rules stay editable here. Leave the extra row blank if you do not
              want to add another rule.
            </p>
          </div>

          <div className="rollout-list">
            {rolloutSlots.map((rule, index) => (
              <div className="rollout-row" key={rule.id}>
                <label className="context-field">
                  <span>{index < rolloutSlots.length - 1 ? `Rule ${index + 1}` : "New rule"}</span>
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
                    {input.variants.map((variant) => (
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

      {input.environmentDetail.rules.length === 0 ? (
        <p className="empty-inline">
          No targeting rules. This environment falls back to its default variant.
        </p>
      ) : null}
    </section>
  );
}

export function FlagEnvironmentsPanel(input: {
  environments: FlagDetail["environments"];
  flagId: string;
  routeContext: Omit<ConsoleContextQuery, "environmentId">;
  selectedEnvironmentId: string | null;
  variants: FlagVariantDetail[];
}) {
  return (
    <article className="panel detail-panel">
      <div className="table-header">
        <div>
          <p className="eyebrow">Environments</p>
          <h2>Configuration by environment</h2>
        </div>
      </div>

      <div className="detail-stack">
        {input.environments.map((environmentDetail) => (
          <EnvironmentCard
            environmentDetail={environmentDetail}
            flagId={input.flagId}
            key={environmentDetail.config.id}
            routeContext={input.routeContext}
            selectedEnvironmentId={input.selectedEnvironmentId}
            variants={input.variants}
          />
        ))}
      </div>
    </article>
  );
}

export function FlagPreviewPanel(input: {
  environments: FlagDetail["environments"];
  previewContextInput: string;
  previewEnvironmentId: string | null;
  previewErrorMessage: string | null;
  previewRequested: boolean;
  previewResetHref: string;
  previewResult: AdminPreviewEvaluationResult | null;
  routeContext: ConsoleContextQuery;
}) {
  return (
    <section className="panel detail-panel preview-panel">
      <div className="table-header">
        <div>
          <p className="eyebrow">Phase 5</p>
          <h2>Preview evaluator</h2>
        </div>
      </div>

      <div className="preview-grid">
        <section className="detail-block">
          <div className="detail-block-header">
            <div>
              <h3>Test a sample context</h3>
              <p>
                Submit a JSON object with string values. Blank input previews the flag with an empty
                context.
              </p>
            </div>
          </div>

          <form className="preview-form" method="GET">
            <ConsoleContextHiddenInputs {...input.routeContext} />
            <input name="preview" type="hidden" value="1" />

            <label className="context-field">
              <span>Preview environment</span>
              <select defaultValue={input.previewEnvironmentId ?? ""} name="previewEnvironmentId">
                {input.environments.map((environmentDetail) => (
                  <option
                    key={environmentDetail.environment.id}
                    value={environmentDetail.environment.id}
                  >
                    {environmentDetail.environment.name} ({environmentDetail.environment.key})
                  </option>
                ))}
              </select>
            </label>

            <label className="context-field">
              <span>Context JSON</span>
              <textarea
                className="preview-textarea"
                defaultValue={input.previewContextInput}
                name="previewContextJson"
                placeholder={'{\n  "userId": "user_123",\n  "email": "alice@example.com"\n}'}
                rows={8}
              />
            </label>

            <div className="preview-actions">
              <button className="primary-button" type="submit">
                Run preview
              </button>
              {input.previewRequested ? (
                <Link className="table-link-button" href={input.previewResetHref}>
                  Clear preview
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="detail-block">
          <div className="detail-block-header">
            <div>
              <h3>Result</h3>
              <p>
                Reason, matched rule, and projection version come from the same Redis-backed
                evaluator as the admin preview API.
              </p>
            </div>
          </div>

          {input.previewErrorMessage ? (
            <p className="detail-feedback detail-feedback-error preview-feedback">
              {input.previewErrorMessage}
            </p>
          ) : null}

          {input.previewResult ? (
            <div className="preview-result-stack">
              <div className="preview-summary-grid">
                <article className="preview-summary-card">
                  <span>Variant</span>
                  <strong>{input.previewResult.variantKey ?? "None"}</strong>
                </article>
                <article className="preview-summary-card">
                  <span>Reason</span>
                  <strong>{input.previewResult.reason}</strong>
                </article>
                <article className="preview-summary-card">
                  <span>Projection</span>
                  <strong>
                    {input.previewResult.projectionVersion !== null
                      ? `v${input.previewResult.projectionVersion}`
                      : "None"}
                  </strong>
                </article>
              </div>

              <p className="detail-inline-meta">
                Matched rule: <code>{input.previewResult.matchedRuleId ?? "No matching rule"}</code>
              </p>

              <div>
                <p className="eyebrow">Resolved value</p>
                <pre className="json-block">{formatJson(input.previewResult.value)}</pre>
              </div>
            </div>
          ) : (
            <p className="empty-inline">
              {input.previewRequested
                ? "No preview result is available."
                : "Run a preview to see the explainable evaluation output for this flag."}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
