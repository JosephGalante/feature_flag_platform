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

function formatRule(rule: AdminFlagRule): string {
  if (rule.ruleType === "attribute_match") {
    const comparisonValue =
      typeof rule.comparisonValue === "string" || Array.isArray(rule.comparisonValue)
        ? JSON.stringify(rule.comparisonValue)
        : "null";

    return `${rule.attributeKey ?? "attribute"} ${rule.operator ?? "matches"} ${comparisonValue} -> ${rule.variantKey}`;
  }

  if (rule.ruleType === "percentage_rollout") {
    return `${rule.rolloutPercentage ?? 0}% rollout -> ${rule.variantKey}`;
  }

  return `${rule.ruleType} -> ${rule.variantKey}`;
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

  return (
    <main className="shell">
      <section className="detail-header">
        <div>
          <p className="eyebrow">Phase 4 / Slice 2</p>
          <h1>{detail.flag.name}</h1>
          <p className="hero-copy">
            Read-only detail view for one flag. Metadata, variants, and environment rules are live
            from the admin API.
          </p>
        </div>
        <div className="detail-actions">
          <Link className="secondary-button detail-back-link" href={backHref}>
            Back to console
          </Link>
        </div>
      </section>

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
            {detail.environments.map((environmentDetail) => (
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

                {environmentDetail.rules.length === 0 ? (
                  <p className="empty-inline">
                    No targeting rules. This environment falls back to its default variant.
                  </p>
                ) : (
                  <ol className="rule-list">
                    {environmentDetail.rules.map((rule) => (
                      <li key={rule.id}>
                        <span className="rule-order">{rule.sortOrder}.</span> {formatRule(rule)}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
