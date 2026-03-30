import {readWorkerConfig} from "./config";
import {createWorkerDatabase} from "./lib/database";
import {processProjectionRefreshBatch} from "./outbox";
import {repairEnvironmentProjectionDrift} from "./reconciliation";

const config = readWorkerConfig();
const {db, pool} = createWorkerDatabase(config.databaseUrl);

let activeCycle: "outbox" | "reconciliation" | null = null;
let isShuttingDown = false;

async function runPollCycle(): Promise<void> {
  if (activeCycle !== null || isShuttingDown) {
    return;
  }

  activeCycle = "outbox";

  try {
    const result = await processProjectionRefreshBatch(db, config.redisUrl);

    if (result.publishedCount > 0 || result.retriedCount > 0 || result.failedCount > 0) {
      console.info("Worker processed outbox batch", result);
    }
  } catch (error) {
    console.error("Worker outbox poll failed", error);
  } finally {
    activeCycle = null;
  }
}

async function runReconciliationCycle(): Promise<void> {
  if (activeCycle !== null || isShuttingDown) {
    return;
  }

  activeCycle = "reconciliation";

  try {
    const result = await repairEnvironmentProjectionDrift(db, config.redisUrl);

    if (result.repairedEnvironments.length > 0 || result.failedEnvironmentIds.length > 0) {
      console.info("Worker reconciliation completed", {
        failedCount: result.failedEnvironmentIds.length,
        failedEnvironmentIds: result.failedEnvironmentIds,
        repairedCount: result.repairedEnvironments.length,
        repairedEnvironments: result.repairedEnvironments.map(
          (environment) => environment.environmentId,
        ),
        skippedCount: result.skippedCount,
      });
    }
  } catch (error) {
    console.error("Worker reconciliation failed", error);
  } finally {
    activeCycle = null;
  }
}

const pollHandle = setInterval(() => {
  void runPollCycle();
}, config.pollIntervalMs);

const reconciliationHandle = setInterval(() => {
  void runReconciliationCycle();
}, config.reconciliationIntervalMs);

const shutdown = async (signal: NodeJS.Signals) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  clearInterval(pollHandle);
  clearInterval(reconciliationHandle);
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

console.info(
  `Worker started with poll interval ${config.pollIntervalMs}ms and reconciliation interval ${config.reconciliationIntervalMs}ms`,
);
void runPollCycle();
