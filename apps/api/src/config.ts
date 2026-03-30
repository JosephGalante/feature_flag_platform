import {readOptionalEnv, readRequiredEnv} from "@config";
import {config as loadEnv} from "dotenv";

loadEnv();

export type QStashConfig = {
  currentSigningKey: string;
  nextSigningKey: string;
  publicApiBaseUrl: string;
  token: string;
};

export type ApiConfig = {
  databaseUrl: string;
  host: string;
  isProduction: boolean;
  port: number;
  qstash: QStashConfig | null;
  redisUrl: string;
  sessionCookieName: string;
  sessionSecret: string;
};

function readQStashConfig(): QStashConfig | null {
  const token = readOptionalEnv("QSTASH_TOKEN");
  const currentSigningKey = readOptionalEnv("QSTASH_CURRENT_SIGNING_KEY");
  const nextSigningKey = readOptionalEnv("QSTASH_NEXT_SIGNING_KEY");
  const publicApiBaseUrl = readOptionalEnv("PUBLIC_API_BASE_URL");

  if (
    token === undefined &&
    currentSigningKey === undefined &&
    nextSigningKey === undefined &&
    publicApiBaseUrl === undefined
  ) {
    return null;
  }

  if (!token || !currentSigningKey || !nextSigningKey || !publicApiBaseUrl) {
    throw new Error(
      "Incomplete QStash configuration. Set QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, and PUBLIC_API_BASE_URL.",
    );
  }

  return {
    currentSigningKey,
    nextSigningKey,
    publicApiBaseUrl: new URL(publicApiBaseUrl).toString(),
    token,
  };
}

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
    qstash: readQStashConfig(),
    redisUrl: readRequiredEnv("REDIS_URL"),
    sessionCookieName: "ff_admin_session",
    sessionSecret: readRequiredEnv("SESSION_SECRET"),
  };
}
