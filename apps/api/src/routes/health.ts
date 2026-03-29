import {sql} from "drizzle-orm";
import type {FastifyInstance} from "fastify";
import type {ApiConfig} from "../config";
import type {ApiDatabase} from "../lib/database";
import {pingRedis} from "../lib/redis";

export async function registerHealthRoutes(
  app: FastifyInstance,
  db: ApiDatabase,
  config: ApiConfig,
): Promise<void> {
  app.get("/health/live", async (_, reply) => {
    return reply.send({
      ok: true,
    });
  });

  app.get("/health/ready", async (_, reply) => {
    try {
      await db.execute(sql`select 1`);
      await pingRedis(config.redisUrl);

      return reply.send({
        checks: {
          database: "ok",
          redis: "ok",
        },
        ok: true,
      });
    } catch (error) {
      app.log.error(error, "API readiness check failed");

      return reply.code(503).send({
        checks: {
          database: "error",
          redis: "error",
        },
        ok: false,
      });
    }
  });
}
