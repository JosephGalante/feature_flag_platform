import {updateFlagEnvironmentAction} from "@/app/actions";
import {
  buildEditableAttributeSlots,
  buildEditableRolloutSlots,
} from "@/app/console/flags/[flagId]/flag-detail-utils";
import ConsoleContextHiddenInputs from "@/components/console-context-hidden-inputs";
import type {FlagEnvironmentDetail, FlagVariantDetail} from "@/lib/admin-api";
import type {ConsoleContextQuery} from "@/lib/console-hrefs";
import {formatTimestamp} from "@/lib/utils";

interface EnvironmentCardProps {
  environmentDetail: FlagEnvironmentDetail;
  flagId: string;
  routeContext: Omit<ConsoleContextQuery, "environmentId">;
  selectedEnvironmentId: string | null;
  variants: FlagVariantDetail[];
}

export default function EnvironmentCard(input: EnvironmentCardProps) {
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
