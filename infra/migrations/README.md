# Migrations

This directory holds Drizzle-generated SQL migrations and Drizzle metadata snapshots.

The canonical workflow is:

1. Update the Drizzle schema in `packages/shared/src/database.ts`.
2. Generate a SQL migration with `pnpm db:generate`.
3. Apply migrations with `pnpm db:migrate`.

When generated SQL is not enough, custom SQL can be added alongside the generated migration set.
