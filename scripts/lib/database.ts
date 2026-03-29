import {readRequiredEnv} from "@packages/config/src/index.js";
import {databaseSchema} from "@packages/shared/src/database.js";
import {config as loadEnv} from "dotenv";
import {type NodePgDatabase, drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";

loadEnv();

export type AppDatabase = NodePgDatabase<typeof databaseSchema>;

export type DatabaseConnection = {
  db: AppDatabase;
  pool: Pool;
};

export function createDatabase(
  connectionString = readRequiredEnv("DATABASE_URL"),
): DatabaseConnection {
  const pool = new Pool({
    connectionString,
  });

  const db = drizzle(pool, {
    schema: databaseSchema,
  });

  return {db, pool};
}
