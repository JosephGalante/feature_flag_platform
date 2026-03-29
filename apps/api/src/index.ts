import {buildApp} from "./app";
import {readApiConfig} from "./config";

const start = async () => {
  const config = readApiConfig();
  const app = await buildApp(config);

  try {
    await app.listen({host: config.host, port: config.port});
    app.log.info({host: config.host, port: config.port}, "API started");
  } catch (error) {
    app.log.error(error, "API failed to start");
    process.exitCode = 1;
  }
};

void start();
