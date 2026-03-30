import EnvironmentCard from "@/components/environment-card";
import type {FlagDetail, FlagVariantDetail} from "@/lib/admin-api";
import type {ConsoleContextQuery} from "@/lib/console-hrefs";

interface FlagEnvironmentsPanelProps {
  environments: FlagDetail["environments"];
  flagId: string;
  isReadOnlyDemo: boolean;
  routeContext: Omit<ConsoleContextQuery, "environmentId">;
  selectedEnvironmentId: string | null;
  variants: FlagVariantDetail[];
}

export default function FlagEnvironmentsPanel(input: FlagEnvironmentsPanelProps) {
  return (
    <article className="panel detail-panel">
      <div className="table-header">
        <div>
          <p className="eyebrow">Environments</p>
          <h2>Configuration by environment</h2>
        </div>
      </div>

      <div className="detail-stack">
        {input.environments.map((environmentDetail) => (
          <EnvironmentCard
            environmentDetail={environmentDetail}
            flagId={input.flagId}
            isReadOnlyDemo={input.isReadOnlyDemo}
            key={environmentDetail.config.id}
            routeContext={input.routeContext}
            selectedEnvironmentId={input.selectedEnvironmentId}
            variants={input.variants}
          />
        ))}
      </div>
    </article>
  );
}
