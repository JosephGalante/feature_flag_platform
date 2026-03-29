import {readOptionalEnv, readRequiredEnv} from "@config";
import {config as loadEnv} from "dotenv";

loadEnv();

export type ApiConfig = {
  databaseUrl: string;
  host: string;
  isProduction: boolean;
  port: number;
  redisUrl: string;
  sessionCookieName: string;
  sessionSecret: string;
};

export function readApiConfig(): ApiConfig {
  const host = readOptionalEnv("API_HOST") ?? "0.0.0.0";
  const port = Number.parseInt(readOptionalEnv("API_PORT") ?? "4000", 10);
  const nodeEnv = readOptionalEnv("NODE_ENV") ?? "development";

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid API_PORT value: ${String(port)}`);
  }

  return {
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    host,
    isProduction: nodeEnv === "production",
    port,
    redisUrl: readRequiredEnv("REDIS_URL"),
    sessionCookieName: "ff_admin_session",
    sessionSecret: readRequiredEnv("SESSION_SECRET"),
  };
}
