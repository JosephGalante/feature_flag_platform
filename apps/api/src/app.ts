import Fastify, {type FastifyInstance} from "fastify";
import {type ApiConfig, readApiConfig} from "./config";
import {createApiDatabase} from "./lib/database";
import {registerAdminRoutes} from "./routes/admin";
import {registerAdminFlagRoutes} from "./routes/admin-flags";
import {registerHealthRoutes} from "./routes/health";

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
  await registerAdminFlagRoutes(app, db, config);

  return app;
}
