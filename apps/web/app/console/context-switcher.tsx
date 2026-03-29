"use client";

import {useRouter, useSearchParams} from "next/navigation";
import {useTransition} from "react";

type SelectOption = {
  id: string;
  label: string;
};

type ContextSwitcherProps = {
  environments: SelectOption[];
  organizations: SelectOption[];
  projects: SelectOption[];
  selectedEnvironmentId: string | null;
  selectedOrganizationId: string | null;
  selectedProjectId: string | null;
};

export function ContextSwitcher({
  environments,
  organizations,
  projects,
  selectedEnvironmentId,
  selectedOrganizationId,
  selectedProjectId,
}: ContextSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function pushSelection(key: "environmentId" | "organizationId" | "projectId", value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (value.length > 0) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }

    if (key === "organizationId") {
      nextParams.delete("projectId");
      nextParams.delete("environmentId");
    }

    if (key === "projectId") {
      nextParams.delete("environmentId");
    }

    startTransition(() => {
      const query = nextParams.toString();
      router.push(query.length > 0 ? `/console?${query}` : "/console");
    });
  }

  return (
    <section className="panel context-panel">
      <div className="context-copy">
        <p className="eyebrow">Context</p>
        <h2>Work inside a real tenant shape</h2>
        <p>
          This UI slice is wired to the live admin API. Change organization, project, and
          environment to drive the next control surfaces.
        </p>
      </div>

      <div className="context-grid">
        <label className="context-field">
          <span>Organization</span>
          <select
            value={selectedOrganizationId ?? ""}
            onChange={(event) => pushSelection("organizationId", event.target.value)}
          >
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.label}
              </option>
            ))}
          </select>
        </label>

        <label className="context-field">
          <span>Project</span>
          <select
            value={selectedProjectId ?? ""}
            onChange={(event) => pushSelection("projectId", event.target.value)}
            disabled={projects.length === 0}
          >
            {projects.length === 0 ? (
              <option value="">No projects</option>
            ) : (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="context-field">
          <span>Environment</span>
          <select
            value={selectedEnvironmentId ?? ""}
            onChange={(event) => pushSelection("environmentId", event.target.value)}
            disabled={environments.length === 0}
          >
            {environments.length === 0 ? (
              <option value="">No environments</option>
            ) : (
              environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.label}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="context-status" aria-live="polite">
        {isPending ? "Updating context..." : "Context is synced to the URL."}
      </div>
    </section>
  );
}
