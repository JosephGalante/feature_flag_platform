import Fastify, {type FastifyInstance} from "fastify";
import {type ApiConfig, readApiConfig} from "./config.js";
import {createApiDatabase} from "./lib/database.js";
import {registerAdminRoutes} from "./routes/admin.js";
import {registerHealthRoutes} from "./routes/health.js";

export async function buildApp(config: ApiConfig = readApiConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  const {db, pool} = createApiDatabase(config.databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  await registerHealthRoutes(app, db, config);
  await registerAdminRoutes(app, db, config);

  return app;
}
