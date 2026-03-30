import {ContextSwitcher} from "@/app/console/context-switcher";
import {
  type AdminAuditLogEntry,
  SESSION_COOKIE_NAME,
  getAuditLogsForOrganization,
  getCurrentAdmin,
  getEnvironmentsForProject,
  getProjectsForOrganization,
} from "@/lib/admin-api";
import {
  buildAuditLogsHref,
  buildConsoleHref,
  buildFlagDetailHref,
  readSearchParam,
} from "@/lib/console-hrefs";
import type {SearchParams} from "@/lib/types";
import {formatTimestamp} from "@/lib/utils";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";

const PAGE_SIZE = 15;
const ENTITY_TYPE_OPTIONS = [
  {label: "All entity types", value: ""},
  {label: "Feature flags", value: "feature_flag"},
  {label: "API keys", value: "api_key"},
] as const;

type AuditLogsPageProps = {
  searchParams?: Promise<SearchParams>;
};

function readPositiveInteger(value: string | string[] | undefined, fallback: number): number {
  const parsedValue = Number(readSearchParam(value));

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return parsedValue;
}

function formatEntityType(value: string): string {
  switch (value) {
    case "feature_flag":
      return "Feature flag";
    case "api_key":
      return "API key";
    default:
      return value.replaceAll("_", " ");
  }
}

function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function renderEntityLink(
  auditLog: AdminAuditLogEntry,
  input: {
    environmentId: string | null;
    organizationId: string | null;
    projectId: string | null;
  },
) {
  if (auditLog.entityType !== "feature_flag") {
    return null;
  }

  return (
    <Link
      className="table-link-button"
      href={buildFlagDetailHref({
        environmentId: input.environmentId,
        flagId: auditLog.entityId,
        organizationId: input.organizationId,
        projectId: input.projectId,
      })}
    >
      Open flag
    </Link>
  );
}

export default async function AuditLogsPage({searchParams}: AuditLogsPageProps) {
  const params = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const admin = await getCurrentAdmin(sessionCookie);

  if (!admin || !sessionCookie) {
    redirect("/login");
  }

  const organizations = admin.memberships;
  const selectedOrganizationId =
    readSearchParam(params.organizationId) ?? organizations[0]?.organizationId ?? null;
  const selectedOrganization =
    organizations.find(({organizationId}) => organizationId === selectedOrganizationId) ??
    organizations[0] ??
    null;
  const projects = selectedOrganization
    ? await getProjectsForOrganization(selectedOrganization.organizationId, sessionCookie)
    : [];
  const selectedProjectId = readSearchParam(params.projectId) ?? projects[0]?.id ?? null;
  const selectedProject = projects.find(({id}) => id === selectedProjectId) ?? projects[0] ?? null;
  const environments = selectedProject
    ? await getEnvironmentsForProject(selectedProject.id, sessionCookie)
    : [];
  const selectedEnvironmentId =
    readSearchParam(params.environmentId) ??
    environments.find(({key}) => key === "staging")?.id ??
    environments[0]?.id ??
    null;
  const selectedEnvironment =
    environments.find(({id}) => id === selectedEnvironmentId) ?? environments[0] ?? null;
  const entityType = readSearchParam(params.entityType);
  const currentPage = readPositiveInteger(params.page, 1);
  const auditFeed = selectedOrganization
    ? await getAuditLogsForOrganization(
        selectedOrganization.organizationId,
        {
          ...(selectedProject ? {projectId: selectedProject.id} : {}),
          ...(selectedEnvironment ? {environmentId: selectedEnvironment.id} : {}),
          ...(entityType ? {entityType} : {}),
          page: currentPage,
          pageSize: PAGE_SIZE,
        },
        sessionCookie,
      )
    : {
        auditLogs: [],
        filters: {
          createdAfter: null,
          createdBefore: null,
          entityType: null,
          environmentId: null,
          projectId: null,
        },
        organization: null,
        pagination: {
          page: 1,
          pageSize: PAGE_SIZE,
          total: 0,
          totalPages: 0,
        },
      };
  const backHref = buildConsoleHref({
    environmentId: selectedEnvironment?.id ?? null,
    organizationId: selectedOrganization?.organizationId ?? null,
    projectId: selectedProject?.id ?? null,
  });
  const paginationHref = (page: number) =>
    buildAuditLogsHref({
      entityType,
      environmentId: selectedEnvironment?.id ?? null,
      organizationId: selectedOrganization?.organizationId ?? null,
      page,
      projectId: selectedProject?.id ?? null,
    });

  return (
    <main className="shell">
      <section className="detail-header">
        <div>
          <p className="eyebrow">Phase 4 / Slice 7</p>
          <h1>Audit Log</h1>
          <p className="hero-copy">
            Review append-only control-plane activity for the current tenant context. This feed is
            reading directly from the admin audit API.
          </p>
        </div>

        <div className="detail-actions">
          <Link className="secondary-button detail-back-link" href={backHref}>
            Back to console
          </Link>
        </div>
      </section>

      <ContextSwitcher
        basePath="/console/audit-logs"
        organizations={organizations.map((organization) => ({
          id: organization.organizationId,
          label: `${organization.organizationName} (${organization.role})`,
        }))}
        projects={projects.map((project) => ({
          id: project.id,
          label: `${project.name} · ${project.key}`,
        }))}
        environments={environments.map((environment) => ({
          id: environment.id,
          label: `${environment.name} · ${environment.key}`,
        }))}
        selectedOrganizationId={selectedOrganization?.organizationId ?? null}
        selectedProjectId={selectedProject?.id ?? null}
        selectedEnvironmentId={selectedEnvironment?.id ?? null}
      />

      <section className="summary-grid">
        <article className="panel stat-card">
          <p className="eyebrow">Organization</p>
          <strong>{auditFeed.organization?.organizationSlug ?? "none"}</strong>
          <span>{auditFeed.organization?.organizationName ?? "Select a valid organization"}</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Entries</p>
          <strong>{auditFeed.pagination.total}</strong>
          <span>Matching the current audit scope</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Page</p>
          <strong>
            {auditFeed.pagination.totalPages === 0
              ? "0 / 0"
              : `${auditFeed.pagination.page} / ${auditFeed.pagination.totalPages}`}
          </strong>
          <span>
            {entityType ? `${formatEntityType(entityType)} filter applied` : "All entity types"}
          </span>
        </article>
      </section>

      <section className="panel detail-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Filters</p>
            <h2>Scope the feed</h2>
          </div>
        </div>

        <form action="/console/audit-logs" className="audit-filter-form">
          <input
            name="organizationId"
            type="hidden"
            value={selectedOrganization?.organizationId ?? ""}
          />
          <input name="projectId" type="hidden" value={selectedProject?.id ?? ""} />
          <input name="environmentId" type="hidden" value={selectedEnvironment?.id ?? ""} />

          <label className="context-field">
            <span>Entity type</span>
            <select defaultValue={entityType ?? ""} name="entityType">
              {ENTITY_TYPE_OPTIONS.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="audit-filter-actions">
            <button className="primary-button create-button" type="submit">
              Apply filters
            </button>
            <Link
              className="table-link-button"
              href={buildAuditLogsHref({
                environmentId: selectedEnvironment?.id ?? null,
                organizationId: selectedOrganization?.organizationId ?? null,
                projectId: selectedProject?.id ?? null,
              })}
            >
              Clear
            </Link>
          </div>
        </form>
      </section>

      <section className="panel detail-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Feed</p>
            <h2>Recent activity</h2>
          </div>
          <p className="table-hint">
            Showing {selectedProject?.key ?? "project"} /{" "}
            {selectedEnvironment?.key ?? "environment"}.
          </p>
        </div>

        {auditFeed.auditLogs.length === 0 ? (
          <div className="empty-state">
            <p>No audit entries matched this scope.</p>
            <span>Try another environment or clear the entity type filter.</span>
          </div>
        ) : (
          <div className="audit-log-list">
            {auditFeed.auditLogs.map((auditLog) => (
              <article className="audit-log-card" key={auditLog.id}>
                <div className="audit-log-header">
                  <div>
                    <p className="eyebrow">{formatEntityType(auditLog.entityType)}</p>
                    <h3>{auditLog.action}</h3>
                  </div>
                  <div className="audit-log-actions">
                    {renderEntityLink(auditLog, {
                      environmentId: selectedEnvironment?.id ?? null,
                      organizationId: selectedOrganization?.organizationId ?? null,
                      projectId: selectedProject?.id ?? null,
                    })}
                    <span className="audit-log-time">{formatTimestamp(auditLog.createdAt)}</span>
                  </div>
                </div>

                <div className="audit-log-meta">
                  <span>
                    Actor <strong>{auditLog.actor.name}</strong> ({auditLog.actor.email})
                  </span>
                  <span>
                    Entity <code>{auditLog.entityId}</code>
                  </span>
                  <span>
                    Request <code>{auditLog.requestId}</code>
                  </span>
                </div>

                <div className="audit-log-diff">
                  <div className="detail-block">
                    <div className="detail-block-header">
                      <div>
                        <h3>Before</h3>
                        <p>Snapshot recorded before the action.</p>
                      </div>
                    </div>
                    {auditLog.before === null ? (
                      <p className="empty-inline">No previous state was stored for this entry.</p>
                    ) : (
                      <pre className="json-block">{renderJson(auditLog.before)}</pre>
                    )}
                  </div>

                  <div className="detail-block">
                    <div className="detail-block-header">
                      <div>
                        <h3>After</h3>
                        <p>Snapshot recorded after the action.</p>
                      </div>
                    </div>
                    {auditLog.after === null ? (
                      <p className="empty-inline">No resulting state was stored for this entry.</p>
                    ) : (
                      <pre className="json-block">{renderJson(auditLog.after)}</pre>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="audit-pagination">
          {auditFeed.pagination.page > 1 ? (
            <Link
              className="table-link-button"
              href={paginationHref(auditFeed.pagination.page - 1)}
            >
              Previous
            </Link>
          ) : (
            <span className="table-link-button is-disabled">Previous</span>
          )}

          <span className="detail-inline-meta">
            Page {auditFeed.pagination.totalPages === 0 ? 0 : auditFeed.pagination.page} of{" "}
            {auditFeed.pagination.totalPages}
          </span>

          {auditFeed.pagination.page < auditFeed.pagination.totalPages ? (
            <Link
              className="table-link-button"
              href={paginationHref(auditFeed.pagination.page + 1)}
            >
              Next
            </Link>
          ) : (
            <span className="table-link-button is-disabled">Next</span>
          )}
        </div>
      </section>
    </main>
  );
}
