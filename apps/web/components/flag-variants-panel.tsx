import type {FlagVariantDetail} from "@/lib/admin-api";
import {formatJson} from "@/lib/utils";

interface FlagVariantsPanelProps {
  variants: FlagVariantDetail[];
}

export default function FlagVariantsPanel(input: FlagVariantsPanelProps) {
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
