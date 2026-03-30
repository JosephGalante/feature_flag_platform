import {loginAction} from "@/app/actions";
import {SESSION_COOKIE_NAME, getCurrentAdmin} from "@/lib/admin-api";
import {readSearchParam} from "@/lib/console-hrefs";
import {buildAuthEntryHref, isReadOnlyDemoEnabled} from "@/lib/demo-mode";
import type {SearchParams} from "@/lib/types";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";

type LoginPageProps = {
  searchParams?: Promise<SearchParams>;
};

function readErrorMessage(value: string | string[] | undefined): string | null {
  const errorCode = readSearchParam(value);

  switch (errorCode) {
    case "missing_email":
      return "Enter the seeded admin email before submitting.";
    case "invalid_credentials":
      return "That email does not match a seeded admin user.";
    case "session_cookie_missing":
      return "The API accepted the login, but no session cookie came back.";
    case "api_unavailable":
      return "The admin API is unavailable right now.";
    case "session_expired":
      return "Your session expired. Sign in again to continue.";
    default:
      return null;
  }
}

export default async function LoginPage({searchParams}: LoginPageProps) {
  const params = (await searchParams) ?? {};
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const isReadOnlyDemo = isReadOnlyDemoEnabled();
  let admin = null;
  let bootstrapError: string | undefined;

  try {
    admin = sessionCookie ? await getCurrentAdmin(sessionCookie) : null;
  } catch {
    bootstrapError = "api_unavailable";
  }

  if (admin) {
    redirect("/console");
  }

  if (isReadOnlyDemo && readSearchParam(params.error) === null && bootstrapError === undefined) {
    redirect("/demo");
  }

  const errorMessage =
    readErrorMessage(params.error) ??
    readErrorMessage(sessionCookie ? (bootstrapError ?? "session_expired") : bootstrapError);

  return (
    <main className="login-shell">
      <section className="login-layout">
        <div className="login-copy">
          <h1>Feature Flag Platform</h1>
          <p>
            The web app now authenticates against the admin API, keeps a session cookie on the web
            origin, and opens into a live control-plane dashboard.
          </p>
        </div>

        <section className="login-panel">
          <p className="eyebrow">Admin Login</p>
          <h2>{isReadOnlyDemo ? "Enter the read-only demo" : "Use the seeded owner account"}</h2>
          {errorMessage ? <p className="login-error">{errorMessage}</p> : null}
          {isReadOnlyDemo ? (
            <a className="primary-button detail-back-link" href={buildAuthEntryHref()}>
              Open demo console
            </a>
          ) : (
            <form action={loginAction}>
              <label className="login-field">
                <span>Email</span>
                <input
                  autoComplete="email"
                  defaultValue="owner@acme.test"
                  name="email"
                  placeholder="owner@acme.test"
                  type="email"
                />
              </label>
              <button className="primary-button" type="submit">
                Enter Console
              </button>
            </form>
          )}
          <p className="login-hint">
            {isReadOnlyDemo
              ? "This deployment opens into a seeded, read-only demo workspace so reviewers can explore it without creating an account."
              : "Use the seeded demo identity to explore the control plane without creating an account."}
          </p>
        </section>
      </section>
    </main>
  );
}
