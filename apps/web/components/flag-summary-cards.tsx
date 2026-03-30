import type {FlagDetail} from "@/lib/admin-api";
import {formatTimestamp} from "@/lib/utils";

interface FlagSummaryCardsProps {
  flag: FlagDetail["flag"];
}

export default function FlagSummaryCards(input: FlagSummaryCardsProps) {
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
