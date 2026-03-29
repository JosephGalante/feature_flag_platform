import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  Kysely,
  type Migration,
  type MigrationProvider,
  type MigrationResultSet,
  Migrator,
  PostgresDialect,
} from "kysely";
import { Pool } from "pg";

type Command = "down" | "list" | "up";

type Database = Record<string, never>;

const supportedExtensions = new Set([".cjs", ".cts", ".js", ".mjs", ".mts", ".ts"]);

loadEnv();

class TypeScriptFileMigrationProvider implements MigrationProvider {
  public constructor(private readonly migrationFolder: string) {}

  public async getMigrations(): Promise<Record<string, Migration>> {
    const entries = await readdir(this.migrationFolder, { withFileTypes: true });
    const migrations: Record<string, Migration> = {};

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name);

      if (!supportedExtensions.has(extension)) {
        continue;
      }

      const migrationName = path.basename(entry.name, extension);
      const moduleUrl = pathToFileURL(path.join(this.migrationFolder, entry.name)).href;
      const imported = await import(moduleUrl);

      if (typeof imported.up !== "function" || typeof imported.down !== "function") {
        throw new Error(`Migration ${entry.name} must export both up and down functions.`);
      }

      migrations[migrationName] = {
        up: imported.up,
        down: imported.down,
      };
    }

    return migrations;
  }
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, "../infra/migrations");

function printResults(results: MigrationResultSet["results"]): void {
  if (!results || results.length === 0) {
    console.info("No migration changes were applied.");
    return;
  }

  for (const result of results) {
    console.info(`${result.migrationName}: ${result.status}`);
  }
}

async function main(): Promise<void> {
  const command = (process.argv[2] as Command | undefined) ?? "up";
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set before running migrations.");
  }

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: databaseUrl,
      }),
    }),
  });

  const migrator = new Migrator({
    db,
    provider: new TypeScriptFileMigrationProvider(migrationsDirectory),
  });

  try {
    if (command === "list") {
      const migrations = await migrator.getMigrations();

      if (migrations.length === 0) {
        console.info("No migrations found.");
        return;
      }

      for (const migration of migrations) {
        console.info(`${migration.executedAt ? "executed" : "pending"} ${migration.name}`);
      }

      return;
    }

    const result =
      command === "down" ? await migrator.migrateDown() : await migrator.migrateToLatest();

    printResults(result.results);

    if (result.error) {
      throw result.error;
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
