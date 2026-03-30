import {createFlagAction, logoutAction} from "@/app/actions";
import {ContextSwitcher} from "@/app/console/context-switcher";
import {
  SESSION_COOKIE_NAME,
  getCurrentAdmin,
  getEnvironmentsForProject,
  getFlagsForProject,
  getProjectsForOrganization,
} from "@/lib/admin-api";
import {
  buildApiKeysHref,
  buildAuditLogsHref,
  buildFlagDetailHref,
  readSearchParam,
} from "@/lib/console-hrefs";
import type {SearchParams} from "@/lib/types";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";

type ConsolePageProps = {
  searchParams?: Promise<SearchParams>;
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readErrorMessage(value: string | string[] | undefined): string | null {
  switch (readSearchParam(value)) {
    case "invalid_flag_form":
      return "The submitted flag form was incomplete.";
    case "duplicate_flag_key":
      return "A flag with that key already exists in this project.";
    case "flag_create_failed":
      return "The API rejected the flag creation request.";
    default:
      return null;
  }
}

export default async function ConsolePage({searchParams}: ConsolePageProps) {
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
  const flags = selectedProject ? await getFlagsForProject(selectedProject.id, sessionCookie) : [];
  const errorMessage = readErrorMessage(params.error);

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Phase 4 / Slice 1</p>
          <h1>Admin Console</h1>
          <p className="hero-copy">
            Login, tenant switching, and the first live control-plane view are now wired against the
            API instead of placeholder copy.
          </p>
        </div>

        <div className="hero-card">
          <p className="hero-user">{admin.user.name}</p>
          <p className="hero-meta">{admin.user.email}</p>
          <p className="hero-meta">
            {selectedEnvironment
              ? `${selectedOrganization?.organizationSlug ?? "org"} / ${selectedProject?.key ?? "project"} / ${selectedEnvironment.key}`
              : "Select a context to continue"}
          </p>
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              Log out
            </button>
          </form>
        </div>
      </section>

      <ContextSwitcher
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
          <p className="eyebrow">Organizations</p>
          <strong>{organizations.length}</strong>
          <span>Available to this admin session</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Projects</p>
          <strong>{projects.length}</strong>
          <span>In the selected organization</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Flags</p>
          <strong>{flags.length}</strong>
          <span>Loaded for the selected project</span>
        </article>
      </section>

      {errorMessage ? (
        <p className="detail-feedback detail-feedback-error">{errorMessage}</p>
      ) : null}

      <section className="panel detail-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Create</p>
            <h2>Ship a new flag</h2>
          </div>
          <p className="table-hint">
            New flags automatically seed default variants and environment configurations.
          </p>
        </div>

        {selectedProject ? (
          <form action={createFlagAction} className="flag-create-form">
            <input
              name="organizationId"
              type="hidden"
              value={selectedOrganization?.organizationId ?? ""}
            />
            <input name="projectId" type="hidden" value={selectedProject.id} />
            <input name="environmentId" type="hidden" value={selectedEnvironment?.id ?? ""} />

            <div className="flag-create-grid">
              <label className="context-field">
                <span>Name</span>
                <input name="name" placeholder="New Checkout" type="text" />
              </label>

              <label className="context-field">
                <span>Key</span>
                <input name="key" placeholder="new_checkout" type="text" />
              </label>

              <label className="context-field">
                <span>Flag type</span>
                <select defaultValue="boolean" name="flagType">
                  <option value="boolean">Boolean</option>
                  <option value="variant">Variant</option>
                </select>
              </label>

              <label className="context-field flag-create-description">
                <span>Description</span>
                <input
                  name="description"
                  placeholder="Roll out the new checkout experience"
                  type="text"
                />
              </label>
            </div>

            <div className="flag-create-actions">
              <button className="primary-button create-button" type="submit">
                Create flag
              </button>
            </div>
          </form>
        ) : (
          <div className="empty-state">
            <p>Select a project before creating a flag.</p>
            <span>
              This form creates project-scoped flags and seeds every environment automatically.
            </span>
          </div>
        )}
      </section>

      <section className="panel table-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Flags</p>
            <h2>Project inventory</h2>
          </div>
          <div className="table-header-actions">
            <p className="table-hint">
              Open a flag to review its environments and change default rollout settings.
            </p>
            {selectedEnvironment ? (
              <>
                <Link
                  className="table-link-button"
                  href={buildAuditLogsHref({
                    environmentId: selectedEnvironment.id,
                    organizationId: selectedOrganization?.organizationId ?? null,
                    projectId: selectedProject?.id ?? null,
                  })}
                >
                  Audit Log
                </Link>
                <Link
                  className="table-link-button"
                  href={buildApiKeysHref({
                    environmentId: selectedEnvironment.id,
                    organizationId: selectedOrganization?.organizationId ?? null,
                    projectId: selectedProject?.id ?? null,
                  })}
                >
                  API Keys
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {flags.length === 0 ? (
          <div className="empty-state">
            <p>No flags exist in this project yet.</p>
            <span>Create a flag through the API or the next UI slice.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => {
                  const detailHref = buildFlagDetailHref({
                    environmentId: selectedEnvironment?.id ?? null,
                    flagId: flag.id,
                    organizationId: selectedOrganization?.organizationId ?? null,
                    projectId: selectedProject?.id ?? null,
                  });

                  return (
                    <tr key={flag.id}>
                      <td>
                        <div className="flag-name">{flag.name}</div>
                        <div className="flag-description">
                          {flag.description ?? "No description yet."}
                        </div>
                      </td>
                      <td>{flag.key}</td>
                      <td>{flag.flagType}</td>
                      <td>
                        <span className={`status-pill status-${flag.status}`}>{flag.status}</span>
                      </td>
                      <td>{formatTimestamp(flag.updatedAt)}</td>
                      <td>
                        <Link className="table-link-button" href={detailHref}>
                          Details
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
