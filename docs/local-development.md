# Local Development

## Prerequisites

- Node.js `22+`
- `pnpm`
- Docker Desktop or another local Docker runtime

## Environment

Create a local env file:

```bash
cp .env.example .env
```

Default ports:

- Postgres: `5432`
- Redis: `6379`
- API: `4000`
- Web: `3000`

If `5432` or `6379` are already taken, update these together in `.env`:

- `DATABASE_URL`
- `REDIS_URL`
- `POSTGRES_PORT`
- `REDIS_PORT`

## Start Infrastructure

From repo root:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
```

## Start The API

The API reads `DATABASE_URL`, `REDIS_URL`, `API_HOST`, `API_PORT`, and `SESSION_SECRET`.

```bash
set -a
source .env
set +a
export SESSION_SECRET=dev-session-secret
pnpm --filter @feature-flag-platform/api dev
```

Notes:

- this uses `tsx watch`
- backend changes restart the API process automatically

## Start The Web App

The web app needs `API_BASE_URL` so it can talk to the API.

```bash
set -a
source .env
set +a
export API_BASE_URL=http://127.0.0.1:${API_PORT}
pnpm --filter @feature-flag-platform/web exec next dev --hostname 127.0.0.1 --port ${WEB_PORT}
```

Optional public demo mode:

```bash
export READ_ONLY_DEMO_MODE=true
export DEMO_ADMIN_EMAIL=owner@acme.test
```

With read-only demo mode enabled, visiting `/` will auto-bootstrap the seeded admin session and open
the console without requiring manual sign-in. Write actions stay disabled in the web UI.

Open:

- `http://127.0.0.1:3000/login`

Seeded admin:

- `owner@acme.test`

## Start The Worker

```bash
set -a
source .env
set +a
pnpm --filter @feature-flag-platform/worker start
```

The worker will:

- poll pending outbox rows
- rebuild Redis projections
- run periodic reconciliation

## Useful Commands

```bash
pnpm typecheck
pnpm lint
pnpm --filter @feature-flag-platform/sdk-js test
pnpm --filter @feature-flag-platform/api exec node --import tsx --test src/projections/preview-flag-evaluation.test.ts
```

Readiness:

```bash
curl http://127.0.0.1:4000/health/ready
```

## Manual Demo Loop

1. Log into the web UI.
2. Choose the seeded org, project, and `staging` environment.
3. Create or edit a flag.
4. Save flag configuration and inspect the audit log.
5. Use the preview evaluator on the flag detail page.
6. Create an environment API key.
7. Call `POST /api/evaluate` or `POST /api/evaluate/batch`.
8. Keep the worker running so Redis projections stay current.

## Stop Everything

Stop app processes with `Ctrl-C`, then stop infrastructure:

```bash
docker compose --env-file .env -f infra/docker/docker-compose.yml down
```
