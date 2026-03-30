import {createApiKeyAction, dismissApiKeyFlashAction, revokeApiKeyAction} from "@/app/actions";
import {ContextSwitcher} from "@/app/console/context-switcher";
import {
  SESSION_COOKIE_NAME,
  getApiKeysForEnvironment,
  getCurrentAdmin,
  getEnvironmentsForProject,
  getProjectsForOrganization,
} from "@/lib/admin-api";
import {API_KEY_FLASH_COOKIE_NAME, decodeApiKeyFlash} from "@/lib/api-key-flash";
import {buildConsoleHref, readSearchParam} from "@/lib/console-hrefs";
import type {SearchParams} from "@/lib/types";
import {formatTimestamp} from "@/lib/utils";
import {cookies} from "next/headers";
import Link from "next/link";
import {redirect} from "next/navigation";

type ApiKeysPageProps = {
  searchParams?: Promise<SearchParams>;
};

function readNoticeMessage(value: string | string[] | undefined): string | null {
  switch (readSearchParam(value)) {
    case "api_key_created":
      return "API key created.";
    case "api_key_revoked":
      return "API key revoked.";
    default:
      return null;
  }
}

function readErrorMessage(value: string | string[] | undefined): string | null {
  switch (readSearchParam(value)) {
    case "invalid_form":
      return "The submitted API key form was incomplete.";
    case "api_key_create_failed":
      return "The API rejected the API key creation request.";
    case "api_key_revoke_failed":
      return "The API rejected the revoke request.";
    default:
      return null;
  }
}

export default async function ApiKeysPage({searchParams}: ApiKeysPageProps) {
  const params = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const flash = decodeApiKeyFlash(cookieStore.get(API_KEY_FLASH_COOKIE_NAME)?.value);
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
  const apiKeys = selectedEnvironment
    ? await getApiKeysForEnvironment(selectedEnvironment.id, sessionCookie)
    : [];
  const activeApiKeys = apiKeys.filter(({status}) => status === "active");
  const revokedApiKeys = apiKeys.filter(({status}) => status === "revoked");
  const backHref = buildConsoleHref({
    environmentId: selectedEnvironment?.id ?? null,
    organizationId: selectedOrganization?.organizationId ?? null,
    projectId: selectedProject?.id ?? null,
  });
  const noticeMessage = readNoticeMessage(params.notice);
  const errorMessage = readErrorMessage(params.error);

  return (
    <main className="shell">
      <section className="detail-header">
        <div>
          <p className="eyebrow">Phase 4 / Slice 6</p>
          <h1>API Keys</h1>
          <p className="hero-copy">
            Manage environment-scoped server keys from the admin UI. New keys reveal their raw value
            once so you can copy them into a client or integration.
          </p>
        </div>

        <div className="detail-actions">
          <Link className="secondary-button detail-back-link" href={backHref}>
            Back to console
          </Link>
        </div>
      </section>

      {flash ? (
        <section className="panel flash-panel">
          <div className="table-header">
            <div>
              <p className="eyebrow">New Key</p>
              <h2>{flash.name}</h2>
            </div>
            <form action={dismissApiKeyFlashAction}>
              <input
                name="organizationId"
                type="hidden"
                value={selectedOrganization?.organizationId ?? ""}
              />
              <input name="projectId" type="hidden" value={selectedProject?.id ?? ""} />
              <input name="environmentId" type="hidden" value={selectedEnvironment?.id ?? ""} />
              <button className="table-link-button" type="submit">
                Dismiss
              </button>
            </form>
          </div>

          <p className="detail-inline-meta">
            Prefix <code>{flash.keyPrefix}</code>. Copy the raw key now.
          </p>
          <code className="secret-value">{flash.rawKey}</code>
        </section>
      ) : null}

      {noticeMessage ? (
        <p className="detail-feedback detail-feedback-success">{noticeMessage}</p>
      ) : null}
      {errorMessage ? (
        <p className="detail-feedback detail-feedback-error">{errorMessage}</p>
      ) : null}

      <ContextSwitcher
        basePath="/console/api-keys"
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
          <p className="eyebrow">Environment</p>
          <strong>{selectedEnvironment?.key ?? "none"}</strong>
          <span>{selectedEnvironment?.name ?? "Select an environment"}</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Active Keys</p>
          <strong>{activeApiKeys.length}</strong>
          <span>Usable by server-side clients</span>
        </article>
        <article className="panel stat-card">
          <p className="eyebrow">Revoked Keys</p>
          <strong>{revokedApiKeys.length}</strong>
          <span>Retained for audit history</span>
        </article>
      </section>

      <section className="detail-grid">
        <article className="panel detail-panel">
          <div className="table-header">
            <div>
              <p className="eyebrow">Create</p>
              <h2>Issue a new key</h2>
            </div>
          </div>

          {selectedEnvironment ? (
            <form action={createApiKeyAction} className="create-form">
              <input
                name="organizationId"
                type="hidden"
                value={selectedOrganization?.organizationId ?? ""}
              />
              <input name="projectId" type="hidden" value={selectedProject?.id ?? ""} />
              <input name="environmentId" type="hidden" value={selectedEnvironment.id} />

              <label className="context-field">
                <span>Key name</span>
                <input name="name" placeholder="Checkout Staging Server" type="text" />
              </label>

              <button className="primary-button create-button" type="submit">
                Create key
              </button>
            </form>
          ) : (
            <div className="empty-state">
              <p>Select an environment before creating an API key.</p>
              <span>This page always manages keys for one environment at a time.</span>
            </div>
          )}
        </article>

        <article className="panel detail-panel">
          <div className="table-header">
            <div>
              <p className="eyebrow">Inventory</p>
              <h2>Environment keys</h2>
            </div>
          </div>

          {selectedEnvironment === null ? (
            <div className="empty-state">
              <p>No environment is selected.</p>
              <span>Choose a valid environment from the context switcher.</span>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="empty-state">
              <p>No API keys exist for this environment yet.</p>
              <span>Create the first one from the panel on the left.</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Prefix</th>
                    <th>Status</th>
                    <th>Last Used</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((apiKey) => (
                    <tr key={apiKey.id}>
                      <td>
                        <div className="flag-name">{apiKey.name}</div>
                        <div className="flag-description">
                          {apiKey.revokedAt
                            ? `Revoked ${formatTimestamp(apiKey.revokedAt)}`
                            : "Active key"}
                        </div>
                      </td>
                      <td>
                        <code>{apiKey.keyPrefix}</code>
                      </td>
                      <td>
                        <span className={`status-pill status-${apiKey.status}`}>
                          {apiKey.status}
                        </span>
                      </td>
                      <td>{apiKey.lastUsedAt ? formatTimestamp(apiKey.lastUsedAt) : "Never"}</td>
                      <td>{formatTimestamp(apiKey.createdAt)}</td>
                      <td>
                        {apiKey.status === "active" ? (
                          <form action={revokeApiKeyAction}>
                            <input name="apiKeyId" type="hidden" value={apiKey.id} />
                            <input
                              name="organizationId"
                              type="hidden"
                              value={selectedOrganization?.organizationId ?? ""}
                            />
                            <input
                              name="projectId"
                              type="hidden"
                              value={selectedProject?.id ?? ""}
                            />
                            <input
                              name="environmentId"
                              type="hidden"
                              value={selectedEnvironment.id}
                            />
                            <button className="table-link-button danger-button" type="submit">
                              Revoke
                            </button>
                          </form>
                        ) : (
                          <span className="flag-description">Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
