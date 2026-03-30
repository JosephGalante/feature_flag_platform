import type {ConsoleContextQuery} from "@/lib/console-hrefs";

export default function ConsoleContextHiddenInputs(input: ConsoleContextQuery) {
  return (
    <>
      <input name="organizationId" type="hidden" value={input.organizationId ?? ""} />
      <input name="projectId" type="hidden" value={input.projectId ?? ""} />
      <input name="environmentId" type="hidden" value={input.environmentId ?? ""} />
    </>
  );
}
