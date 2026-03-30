import {archiveFlagAction, updateFlagMetadataAction} from "@/app/actions";
import ConsoleContextHiddenInputs from "@/components/console-context-hidden-inputs";
import type {FlagDetail} from "@/lib/admin-api";
import type {ConsoleContextQuery} from "@/lib/console-hrefs";

interface FlagMetadataPanelProps {
  flag: FlagDetail["flag"];
  routeContext: ConsoleContextQuery;
}

export default function FlagMetadataPanel(input: FlagMetadataPanelProps) {
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
