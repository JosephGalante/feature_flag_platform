import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv();

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/shared/src/database.ts",
  out: "./infra/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/feature_flags",
  },
  strict: true,
  verbose: true,
});
