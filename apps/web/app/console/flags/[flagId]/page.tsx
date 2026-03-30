import {
  type AdminPreviewEvaluationResult,
  SESSION_COOKIE_NAME,
  getCurrentAdmin,
  getFlagDetail,
  previewFlagForEnvironment,
} from "@/lib/admin-api";
import {buildConsoleHref, buildFlagDetailHref, readSearchParam} from "@/lib/console-hrefs";
import type {SearchParams} from "@/lib/types";
import {cookies} from "next/headers";
import {notFound, redirect} from "next/navigation";
import {
  FlagDetailHeader,
  FlagEnvironmentsPanel,
  FlagMetadataPanel,
  FlagPreviewPanel,
  FlagSummaryCards,
  FlagVariantsPanel,
} from "./flag-detail-sections";
import {
  parsePreviewContext,
  readFlagDetailErrorMessage,
  readFlagDetailNoticeMessage,
  readPreviewErrorMessage,
} from "./flag-detail-utils";

type FlagDetailPageProps = {
  params: Promise<{flagId: string}>;
  searchParams?: Promise<SearchParams>;
};

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

  const organizationId = readSearchParam(resolvedQuery.organizationId);
  const projectId = readSearchParam(resolvedQuery.projectId);
  const selectedEnvironmentId = readSearchParam(resolvedQuery.environmentId);
  const routeContext = {
    environmentId: selectedEnvironmentId,
    organizationId,
    projectId,
  };
  const backHref = buildConsoleHref({
    ...routeContext,
  });
  const previewResetHref = buildFlagDetailHref({
    flagId,
    ...routeContext,
  });
  const noticeMessage = readFlagDetailNoticeMessage(resolvedQuery.notice);
  const errorMessage = readFlagDetailErrorMessage(resolvedQuery.error);
  const previewRequested = readSearchParam(resolvedQuery.preview) === "1";
  const previewEnvironmentId =
    readSearchParam(resolvedQuery.previewEnvironmentId) ??
    selectedEnvironmentId ??
    detail.environments[0]?.environment.id ??
    null;
  const previewContextInput = readSearchParam(resolvedQuery.previewContextJson) ?? "";
  let previewResult: AdminPreviewEvaluationResult | null = null;
  let previewErrorMessage: string | null = null;

  if (previewRequested) {
    const previewEnvironmentExists = detail.environments.some(
      (environmentDetail) => environmentDetail.environment.id === previewEnvironmentId,
    );

    if (!previewEnvironmentId || !previewEnvironmentExists) {
      previewErrorMessage = readPreviewErrorMessage("invalid_preview_environment");
    } else {
      const parsedContext = parsePreviewContext(previewContextInput);

      if ("error" in parsedContext) {
        previewErrorMessage = readPreviewErrorMessage(parsedContext.error);
      } else {
        try {
          previewResult = await previewFlagForEnvironment(
            flagId,
            {
              context: parsedContext.context,
              environmentId: previewEnvironmentId,
            },
            sessionCookie,
          );
        } catch (error) {
          previewErrorMessage = readPreviewErrorMessage(
            error instanceof Error ? error.message : "PREVIEW_FAILED",
          );
        }
      }
    }
  }

  return (
    <main className="shell">
      <FlagDetailHeader
        backHref={backHref}
        errorMessage={errorMessage}
        name={detail.flag.name}
        noticeMessage={noticeMessage}
      />
      <FlagSummaryCards flag={detail.flag} />
      <FlagMetadataPanel flag={detail.flag} routeContext={routeContext} />

      <section className="detail-grid">
        <FlagVariantsPanel variants={detail.variants} />
        <FlagEnvironmentsPanel
          environments={detail.environments}
          flagId={detail.flag.id}
          routeContext={{
            organizationId,
            projectId,
          }}
          selectedEnvironmentId={selectedEnvironmentId}
          variants={detail.variants}
        />
      </section>

      <FlagPreviewPanel
        environments={detail.environments}
        previewContextInput={previewContextInput}
        previewEnvironmentId={previewEnvironmentId}
        previewErrorMessage={previewErrorMessage}
        previewRequested={previewRequested}
        previewResetHref={previewResetHref}
        previewResult={previewResult}
        routeContext={routeContext}
      />
    </main>
  );
}
