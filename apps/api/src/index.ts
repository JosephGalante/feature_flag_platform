import Fastify from "fastify";

const app = Fastify({
  logger: true,
});

const host = process.env.API_HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.API_PORT ?? "4000", 10);

const start = async () => {
  try {
    await app.listen({host, port});
    app.log.info({host, port}, "API scaffold started");
  } catch (error) {
    app.log.error(error, "API scaffold failed to start");
    process.exitCode = 1;
  }
};

void start();
