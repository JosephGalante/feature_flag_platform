import type {NextConfig} from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@feature-flag-platform/config",
    "@feature-flag-platform/evaluation-core",
    "@feature-flag-platform/sdk-js",
    "@feature-flag-platform/shared",
  ],
};

export default nextConfig;
