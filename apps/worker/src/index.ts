const idleHandle = setInterval(() => {
  // Keep the scaffolded worker process alive until background jobs are implemented.
}, 60_000);

const shutdown = (signal: NodeJS.Signals) => {
  clearInterval(idleHandle);
  console.info(`Worker scaffold shutting down after ${signal}`);
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.info("Worker scaffold started. No jobs are registered yet.");
