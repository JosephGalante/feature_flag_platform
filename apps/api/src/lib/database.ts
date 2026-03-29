import {databaseSchema} from "@packages/shared/src/database.js";
import {type NodePgDatabase, drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";

export type ApiDatabase = NodePgDatabase<typeof databaseSchema>;

type ApiDatabaseConnection = {
  db: ApiDatabase;
  pool: Pool;
};

export function createApiDatabase(connectionString: string): ApiDatabaseConnection {
  const pool = new Pool({
    connectionString,
  });

  const db = drizzle(pool, {
    schema: databaseSchema,
  });

  return {db, pool};
}
