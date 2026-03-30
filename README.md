# Feature Flag Platform

A multi-tenant feature flag system built to demonstrate backend platform thinking, not just CRUD.

This project separates a Postgres-backed control plane from a Redis-backed evaluation plane, supports environment-scoped API keys, keeps a full audit trail, and uses asynchronous projection rebuilds so evaluation stays fast while source-of-truth data remains relational and recoverable.

## Why This Project Is Interesting

This repo is meant to show the kinds of tradeoffs senior engineers and hiring managers care about:

- clear separation between source-of-truth writes and low-latency reads
- deterministic evaluation logic isolated in a pure package
- transactional write behavior with auditability
- rebuildable Redis projections instead of Redis as source of truth
- a realistic deployment tradeoff: cheap hosted async processing via QStash callbacks instead of paying for an always-on worker

## What It Includes

- Fastify admin API for organizations, projects, environments, flags, API keys, sessions, and audit history
- Next.js admin UI for context switching, flag management, preview evaluation, API keys, and audit inspection
- public evaluation API for single-flag and batch evaluation
- pure evaluation engine in `packages/evaluation-core`
- thin JavaScript SDK in `packages/sdk-js`
- optional worker implementation plus a cheaper hosted QStash-based async path

## Architecture At A Glance

The system is intentionally split into two planes:

- Control plane: admins write configuration to Postgres
- Data plane: applications evaluate flags from compiled per-environment projections stored in Redis

Core rules:

- Postgres is authoritative
- Redis is derived and rebuildable
- evaluation logic is pure and isolated from HTTP, DB, and Redis concerns
- evaluation-affecting writes append audit information transactionally
- async rebuilds update Redis projections after writes

### Request / Data Flow

1. Admin writes flag configuration through the control-plane API.
2. Postgres remains the source of truth for flags, environments, API keys, and audit logs.
3. The API publishes an async projection refresh job.
4. QStash calls back into the API.
5. The API rebuilds the affected environment projection and writes it to Redis.
6. Evaluation requests read the compiled projection from Redis and execute pure rule logic.

## Current Deployment Shape

For the cheapest useful hosted deployment:

- web: Vercel
- API: Render
- database: Supabase Postgres
- cache / projected read model: Upstash Redis
- async job transport: Upstash QStash

This preserves the asynchronous architecture story without requiring a paid always-on background worker.

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

## Local Development

Quick start:

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

Optional local worker:

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
- open `http://127.0.0.1:3000/`

See [docs/local-development.md](docs/local-development.md) for the fuller walkthrough.

## Evaluation API

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

## JavaScript SDK

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

## What This Repo Demonstrates

- backend system design with explicit control-plane / data-plane boundaries
- practical event-driven architecture for derived read models
- correctness-first write paths with auditability
- platform-style API surface design
- a realistic hosting decision under budget constraints

## Additional Docs

- [docs/architecture.md](docs/architecture.md)
- [docs/api.md](docs/api.md)
- [docs/deployment.md](docs/deployment.md)
- [docs/local-development.md](docs/local-development.md)
- [docs/domain-model.md](docs/domain-model.md)
- [docs/rationale.md](docs/rationale.md)
- [docs/acceptance-demo.md](docs/acceptance-demo.md)
- [docs/mvp-spec.md](docs/mvp-spec.md)
- [docs/build-plan.md](docs/build-plan.md)
