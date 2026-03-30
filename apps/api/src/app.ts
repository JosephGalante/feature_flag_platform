import Fastify, {type FastifyInstance} from "fastify";
import {type ApiConfig, readApiConfig} from "./config";
import {createApiDatabase} from "./lib/database";
import {registerAdminRoutes} from "./routes/admin";
import {registerAdminApiKeyRoutes} from "./routes/admin-api-keys";
import {registerAdminAuditLogRoutes} from "./routes/admin-audit-logs";
import {registerAdminFlagRoutes} from "./routes/admin-flags";
import {registerHealthRoutes} from "./routes/health";
import {registerInternalProjectionRoutes} from "./routes/internal-projections";

export async function buildApp(config: ApiConfig = readApiConfig()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
  });

  const {db, pool} = createApiDatabase(config.databaseUrl);

  app.addHook("onClose", async () => {
    await pool.end();
  });

  await registerHealthRoutes(app, db, config);
  await registerInternalProjectionRoutes(app, db, config);
  await registerAdminRoutes(app, db, config);
  await registerAdminFlagRoutes(app, db, config);
  await registerAdminApiKeyRoutes(app, db, config);
  await registerAdminAuditLogRoutes(app, db, config);

  return app;
}
