import {readOptionalEnv, readRequiredEnv} from "@config";
import {config as loadEnv} from "dotenv";

loadEnv();

export type WorkerConfig = {
  databaseUrl: string;
  pollIntervalMs: number;
  redisUrl: string;
};

export function readWorkerConfig(): WorkerConfig {
  const pollIntervalMs = Number.parseInt(readOptionalEnv("WORKER_POLL_INTERVAL_MS") ?? "2000", 10);

  if (!Number.isInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error(`Invalid WORKER_POLL_INTERVAL_MS value: ${String(pollIntervalMs)}`);
  }

  return {
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    pollIntervalMs,
    redisUrl: readRequiredEnv("REDIS_URL"),
  };
}
