"use client";

import Link from "next/link";
import "./globals.css";

type GlobalErrorPageProps = {
  error: Error & {digest?: string};
  reset: () => void;
};

export default function GlobalErrorPage({error, reset}: GlobalErrorPageProps) {
  return (
    <html lang="en">
      <body>
        <main className="login-shell">
          <section className="login-layout">
            <div className="login-copy">
              <p className="eyebrow">Application Error</p>
              <h1>Feature Flag Platform</h1>
              <p>
                The app encountered an unexpected error while loading. Retry the request or return
                to the login screen.
              </p>
            </div>

            <section className="login-panel error-panel">
              <p className="login-error">{error.message}</p>
              <div className="error-panel-actions">
                <button className="primary-button" onClick={() => reset()} type="button">
                  Try again
                </button>
                <Link className="secondary-button detail-back-link" href="/login">
                  Go to login
                </Link>
              </div>
            </section>
          </section>
        </main>
      </body>
    </html>
  );
}
