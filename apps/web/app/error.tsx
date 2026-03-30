"use client";

import Link from "next/link";

type ErrorPageProps = {
  error: Error & {digest?: string};
  reset: () => void;
};

function readErrorCopy(error: Error): {description: string; title: string} {
  if (error.message === "ADMIN_API_UNAVAILABLE" || error.message.startsWith("Failed to load ")) {
    return {
      description:
        "The web app could not reach the admin API. Confirm the API is running and try again.",
      title: "Admin API unavailable",
    };
  }

  return {
    description: "An unexpected error interrupted this page. Try again or return to the console.",
    title: "Something went wrong",
  };
}

export default function ErrorPage({error, reset}: ErrorPageProps) {
  const copy = readErrorCopy(error);

  return (
    <main className="login-shell">
      <section className="login-layout">
        <div className="login-copy">
          <p className="eyebrow">Application Error</p>
          <h1>{copy.title}</h1>
          <p>{copy.description}</p>
        </div>

        <section className="login-panel error-panel">
          <p className="login-error">{error.message}</p>
          <div className="error-panel-actions">
            <button className="primary-button" onClick={() => reset()} type="button">
              Try again
            </button>
            <Link className="secondary-button detail-back-link" href="/console">
              Return to console
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
