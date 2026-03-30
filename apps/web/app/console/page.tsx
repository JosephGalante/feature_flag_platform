import {logoutAction} from "@/app/actions";
import {ContextSwitcher} from "@/app/console/context-switcher";
import {
  SESSION_COOKIE_NAME,
  getCurrentAdmin,
  getEnvironmentsForProject,
  getFlagsForProject,
  getProjectsForOrganization,
} from "@/lib/admin-api";
import type {SearchParams} from "@/lib/types";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";

type ConsolePageProps = {
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

function buildFlagDetailHref(input: {
  environmentId: string | null;
  flagId: string;
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

  return `/console/flags/${input.flagId}${queryString.length > 0 ? `?${queryString}` : ""}`;
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
    readParam(params.organizationId) ?? organizations[0]?.organizationId ?? null;
  const selectedOrganization =
    organizations.find(({organizationId}) => organizationId === selectedOrganizationId) ??
    organizations[0] ??
    null;
  const projects = selectedOrganization
    ? await getProjectsForOrganization(selectedOrganization.organizationId, sessionCookie)
    : [];
  const selectedProjectId = readParam(params.projectId) ?? projects[0]?.id ?? null;
  const selectedProject = projects.find(({id}) => id === selectedProjectId) ?? projects[0] ?? null;
  const environments = selectedProject
    ? await getEnvironmentsForProject(selectedProject.id, sessionCookie)
    : [];
  const selectedEnvironmentId =
    readParam(params.environmentId) ??
    environments.find(({key}) => key === "staging")?.id ??
    environments[0]?.id ??
    null;
  const selectedEnvironment =
    environments.find(({id}) => id === selectedEnvironmentId) ?? environments[0] ?? null;
  const flags = selectedProject ? await getFlagsForProject(selectedProject.id, sessionCookie) : [];

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

      <section className="panel table-panel">
        <div className="table-header">
          <div>
            <p className="eyebrow">Flags</p>
            <h2>Project inventory</h2>
          </div>
          <p className="table-hint">
            This slice adds a linked read-only detail view. Edit controls come next.
          </p>
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
                </tr>
              </thead>
              <tbody>
                {flags.map((flag) => (
                  <tr key={flag.id}>
                    <td>
                      <Link
                        className="flag-link"
                        href={buildFlagDetailHref({
                          environmentId: selectedEnvironment?.id ?? null,
                          flagId: flag.id,
                          organizationId: selectedOrganization?.organizationId ?? null,
                          projectId: selectedProject?.id ?? null,
                        })}
                      >
                        <div className="flag-name">{flag.name}</div>
                      </Link>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
