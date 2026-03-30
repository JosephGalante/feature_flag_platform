import {databaseSchema} from "@shared/database";
import {type NodePgDatabase, drizzle} from "drizzle-orm/node-postgres";
import {Pool} from "pg";

export type WorkerDatabase = NodePgDatabase<typeof databaseSchema>;

type WorkerDatabaseConnection = {
  db: WorkerDatabase;
  pool: Pool;
};

export function createWorkerDatabase(connectionString: string): WorkerDatabaseConnection {
  const pool = new Pool({
    connectionString,
  });

  const db = drizzle(pool, {
    schema: databaseSchema,
  });

  return {db, pool};
}
