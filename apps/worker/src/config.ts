import {readOptionalEnv, readRequiredEnv} from "@config";
import {config as loadEnv} from "dotenv";

loadEnv();

export type WorkerConfig = {
  databaseUrl: string;
  pollIntervalMs: number;
  reconciliationIntervalMs: number;
  redisUrl: string;
};

function readPositiveIntervalMs(name: string, fallback: string): number {
  const value = Number.parseInt(readOptionalEnv(name) ?? fallback, 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${name} value: ${String(value)}`);
  }

  return value;
}

export function readWorkerConfig(): WorkerConfig {
  const pollIntervalMs = readPositiveIntervalMs("WORKER_POLL_INTERVAL_MS", "2000");
  const reconciliationIntervalMs = readPositiveIntervalMs("RECONCILIATION_INTERVAL_MS", "300000");

  return {
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    pollIntervalMs,
    reconciliationIntervalMs,
    redisUrl: readRequiredEnv("REDIS_URL"),
  };
}
