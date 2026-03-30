import ConsoleContextHiddenInputs from "@/components/console-context-hidden-inputs";
import type {AdminPreviewEvaluationResult} from "@/lib/admin-api";
import type {getFlagDetail} from "@/lib/admin-api";
import type {ConsoleContextQuery} from "@/lib/console-hrefs";
import {formatJson} from "@/lib/utils";
import Link from "next/link";

type FlagDetail = NonNullable<Awaited<ReturnType<typeof getFlagDetail>>>;

interface FlagPreviewPanelProps {
  environments: FlagDetail["environments"];
  previewContextInput: string;
  previewEnvironmentId: string | null;
  previewErrorMessage: string | null;
  previewRequested: boolean;
  previewResetHref: string;
  previewResult: AdminPreviewEvaluationResult | null;
  routeContext: ConsoleContextQuery;
}

export default function FlagPreviewPanel(input: FlagPreviewPanelProps) {
  return (
    <section className="panel detail-panel preview-panel">
      <div className="table-header">
        <div>
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
