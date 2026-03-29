import type {KnipConfig} from "knip";

const config: KnipConfig = {
  $schema: "https://unpkg.com/knip@6/schema.json",
  workspaces: {
    "apps/api": {
      // These workspace packages are consumed through the root TS path alias
      // (`@packages/*`) rather than through their package names.
      ignoreDependencies: ["@feature-flag-platform/config", "@feature-flag-platform/shared"],
    },
  },
};

export default config;
