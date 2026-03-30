# Deployment Notes

This repo now includes:

- app Dockerfiles for `apps/api`, `apps/web`, and `apps/worker`
- a GitHub Actions workflow that runs install, lint, typecheck, tests, and knip
- a root `pnpm test` command and package-level test scripts for API and worker

## Suggested Deployment Shape

Run three application processes:

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
- `apps/web` needs `API_BASE_URL` pointed at the deployed API.
- `apps/worker` needs Postgres and Redis access so it can process projection refresh events.

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
