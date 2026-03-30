# Deployment Notes

This repo now includes:

- app Dockerfiles for `apps/api`, `apps/web`, and `apps/worker`
- a GitHub Actions workflow that runs install, lint, typecheck, tests, and knip
- a root `pnpm test` command and package-level test scripts for API and worker

## Suggested Deployment Shape

For the cheapest useful hosted deployment, run:

1. API
2. Web
3. QStash

For a more traditional always-on deployment, you can still run:

1. API
2. Web
3. Worker

Back them with:

- Postgres
- Redis

The API, web app, and worker all expect the same workspace source tree and environment variables from `.env`.

## Docker Builds

Build from the repository root so workspace packages resolve correctly.

```bash
docker build -f apps/api/Dockerfile -t feature-flag-platform-api .
docker build -f apps/web/Dockerfile -t feature-flag-platform-web .
docker build -f apps/worker/Dockerfile -t feature-flag-platform-worker .
```

## Runtime Notes

- `apps/api` listens on `API_PORT` and needs Postgres, Redis, and `SESSION_SECRET`.
- `apps/api` can publish projection refresh jobs to QStash when these env vars are set:
  - `QSTASH_TOKEN`
  - `QSTASH_CURRENT_SIGNING_KEY`
  - `QSTASH_NEXT_SIGNING_KEY`
  - `PUBLIC_API_BASE_URL`
- `apps/web` needs `API_BASE_URL` pointed at the deployed API.
- `apps/worker` remains available if you want an always-on process to handle projection refresh events instead of QStash.

### Cheap Hosted Path

Use:

- Render for `apps/api`
- Vercel for `apps/web`
- Supabase for Postgres
- Upstash Redis for Redis
- Upstash QStash for async projection rebuild callbacks

With that setup:

- admin writes in the API publish signed QStash jobs
- QStash calls back into the API at `/internal/projections/rebuild-async`
- the API rebuilds the affected Redis projection without requiring a paid background worker

### Worker Path

If you prefer a dedicated background process, `apps/worker` still needs Postgres and Redis access so it can process projection refresh events and run reconciliation.

For a public portfolio deployment, the web app can also use:

- `READ_ONLY_DEMO_MODE=true`
- `DEMO_ADMIN_EMAIL=owner@acme.test`

That mode bootstraps a seeded admin session through the web app and keeps write actions disabled in
the UI so reviewers can explore the product without creating an account.

## Verification

Run the full repository verification locally with:

```bash
pnpm ci
```

This runs:

- syntax checks
- Biome lint
- TypeScript typecheck
- package tests
- knip

## Portfolio Deploy Note

If you deploy this for prospective employers, you do not need to require account creation.

Practical options:

- keep a seeded demo admin identity for guided exploration
- provide a read-only demo environment or preconfigured tenant context
- clearly label the current login flow as a demo convenience, not production authentication

That keeps the app easy to explore without forcing reviewers through signup friction.
