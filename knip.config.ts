import type {KnipConfig} from "knip";

const config: KnipConfig = {
  $schema: "https://unpkg.com/knip@6/schema.json",
  workspaces: {
    "apps/api": {
      ignoreDependencies: ["@feature-flag-platform/config", "@feature-flag-platform/shared"],
    },
  },
};

export default config;
