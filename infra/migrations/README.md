# Migrations

This directory holds Kysely migration files for the platform schema.

Phase 0 intentionally scaffolds the migration runner and directory layout without adding schema migrations yet.

Migration file naming should stay lexicographically sortable, for example:

- `20260329120000_initial_schema.ts`
- `20260329123000_seed_demo_tenant.ts`
