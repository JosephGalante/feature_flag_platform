import type {Metadata} from "next";
import type {ReactNode} from "react";

export const metadata: Metadata = {
  title: "Feature Flag Platform",
  description: "Phase 0 workspace scaffold",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({children}: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
