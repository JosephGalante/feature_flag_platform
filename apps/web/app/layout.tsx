import type {Metadata} from "next";
import type {ReactNode} from "react";
import "./globals.css";

const featureFlagRepoUrl =
  process.env.NEXT_PUBLIC_GITHUB_REPO_URL ??
  "https://github.com/JosephGalante/feature_flag_platform";

export const metadata: Metadata = {
  title: "Feature Flag Platform Admin",
  description: "Feature Flag Platform admin console",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({children}: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <a
          aria-label="View the Feature Flag Platform GitHub repository"
          className="github-link"
          href={featureFlagRepoUrl}
          rel="noreferrer"
          target="_blank"
        >
          <svg aria-hidden="true" className="github-link__icon" viewBox="0 0 24 24">
            <path
              d="M12 1.5C6.2 1.5 1.5 6.29 1.5 12.2c0 4.72 3.05 8.72 7.28 10.14.53.1.72-.23.72-.52 0-.26-.01-.94-.01-1.84-2.96.66-3.58-1.45-3.58-1.45-.48-1.25-1.18-1.58-1.18-1.58-.97-.67.07-.66.07-.66 1.07.08 1.64 1.13 1.64 1.13.95 1.67 2.49 1.19 3.09.91.1-.71.37-1.19.67-1.46-2.36-.28-4.84-1.21-4.84-5.41 0-1.2.42-2.18 1.1-2.95-.11-.28-.48-1.41.11-2.94 0 0 .9-.29 2.97 1.13a10.18 10.18 0 0 1 5.4 0c2.06-1.42 2.96-1.13 2.96-1.13.6 1.53.23 2.66.11 2.94.69.77 1.1 1.75 1.1 2.95 0 4.21-2.49 5.13-4.87 5.4.39.34.72 1 .72 2.03 0 1.46-.01 2.64-.01 3 0 .29.19.63.73.52 4.22-1.42 7.27-5.42 7.27-10.14C22.5 6.29 17.8 1.5 12 1.5Z"
              fill="currentColor"
            />
          </svg>
          <span className="github-link__label">GitHub</span>
        </a>
        {children}
      </body>
    </html>
  );
}
