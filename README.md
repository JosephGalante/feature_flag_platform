# Feature Flag Platform

Multi-tenant feature flag platform with a Postgres-backed control plane, Redis-backed data plane, transactional outbox propagation, reconciliation, and a thin JavaScript SDK.

## Current Status

This repo is implemented, not just planned.

Current MVP surfaces:

- admin API for organizations, projects, environments, flags, audit logs, and API keys
- Next.js admin UI for login, context switching, flag management, preview evaluation, API keys, and audit history
- Redis-backed public evaluation API for one or many flags
- worker-driven outbox processing and reconciliation
- thin JS SDK with `evaluate()` and `evaluateMany()`

## Architecture

The system is intentionally split into two planes:

- Control plane: admins write source-of-truth configuration to Postgres.
- Data plane: applications evaluate flags from compiled environment projections stored in Redis.

Important implementation rules:

- Postgres is authoritative.
- Redis is rebuildable and not authoritative.
- evaluation logic lives in `packages/evaluation-core`
- evaluation-affecting writes append audit rows and outbox rows transactionally
- the worker rebuilds full environment projections
- reconciliation repairs missing or stale Redis state

## Repo Layout

```text
apps/
  api/
  web/
  worker/

packages/
  config/
  evaluation-core/
  sdk-js/
  shared/

infra/
  docker/
  migrations/

docs/
```

## Local Run

Short version:

```bash
pnpm install
cp .env.example .env
docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
pnpm db:migrate
pnpm db:seed
```

Start the API:

```bash
set -a
source .env
set +a
export SESSION_SECRET=dev-session-secret
pnpm --filter @feature-flag-platform/api dev
```

Start the web app in another terminal:

```bash
set -a
source .env
set +a
export API_BASE_URL=http://127.0.0.1:${API_PORT}
pnpm --filter @feature-flag-platform/web exec next dev --hostname 127.0.0.1 --port ${WEB_PORT}
```

Start the worker in another terminal:

```bash
set -a
source .env
set +a
pnpm --filter @feature-flag-platform/worker start
```

Open:

- web UI: `http://127.0.0.1:3000/login`
- API readiness: `http://127.0.0.1:4000/health/ready`

Seeded admin:

- `owner@acme.test`

Optional read-only demo mode:

- set `READ_ONLY_DEMO_MODE=true`
- keep `DEMO_ADMIN_EMAIL=owner@acme.test`
- open `http://127.0.0.1:3000/` and the web app will bootstrap a seeded demo session automatically

For the fuller walkthrough, see [docs/local-development.md](docs/local-development.md).

For deployment and verification notes, see [docs/deployment.md](docs/deployment.md).

## Public Runtime API

Single flag:

```http
POST /api/evaluate
x-api-key: <environment-api-key>
content-type: application/json
```

```json
{
  "flagKey": "new_checkout",
  "context": {
    "userId": "user_123",
    "email": "alice@example.com"
  }
}
```

Batch:

```http
POST /api/evaluate/batch
x-api-key: <environment-api-key>
content-type: application/json
```

```json
{
  "flagKeys": ["new_checkout", "new_nav"],
  "context": {
    "userId": "user_123",
    "email": "alice@example.com"
  }
}
```

See [docs/api.md](docs/api.md) for the full contract.

## JS SDK

```ts
import {FeatureFlagClient} from "@feature-flag-platform/sdk-js";

const client = new FeatureFlagClient({
  apiKey: process.env.FLAG_API_KEY!,
  baseUrl: "http://127.0.0.1:4000",
});

const single = await client.evaluate("new_checkout", {
  email: "alice@example.com",
  userId: "user_123",
});

const many = await client.evaluateMany(["new_checkout", "new_nav"], {
  email: "alice@example.com",
  userId: "user_123",
});
```

## Docs

- [docs/mvp-spec.md](docs/mvp-spec.md)
- [docs/domain-model.md](docs/domain-model.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/api.md](docs/api.md)
- [docs/build-plan.md](docs/build-plan.md)
- [docs/acceptance-demo.md](docs/acceptance-demo.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/local-development.md](docs/local-development.md)
- [docs/rationale.md](docs/rationale.md)
