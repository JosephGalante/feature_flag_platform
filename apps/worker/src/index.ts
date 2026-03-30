import {readWorkerConfig} from "./config";
import {createWorkerDatabase} from "./lib/database";
import {processProjectionRefreshBatch} from "./outbox";

const config = readWorkerConfig();
const {db, pool} = createWorkerDatabase(config.databaseUrl);

let isPolling = false;
let isShuttingDown = false;

async function runPollCycle(): Promise<void> {
  if (isPolling || isShuttingDown) {
    return;
  }

  isPolling = true;

  try {
    const result = await processProjectionRefreshBatch(db, config.redisUrl);

    if (result.publishedCount > 0 || result.retriedCount > 0 || result.failedCount > 0) {
      console.info("Worker processed outbox batch", result);
    }
  } catch (error) {
    console.error("Worker outbox poll failed", error);
  } finally {
    isPolling = false;
  }
}

const pollHandle = setInterval(() => {
  void runPollCycle();
}, config.pollIntervalMs);

const shutdown = async (signal: NodeJS.Signals) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearInterval(pollHandle);
  await pool.end();
  console.info(`Worker shutting down after ${signal}`);
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

console.info(`Worker started with poll interval ${config.pollIntervalMs}ms`);
void runPollCycle();
