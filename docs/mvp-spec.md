# MVP Spec

## Product Goal

Build a serious V1 multi-tenant feature flag platform for internal B2B-style usage.

The MVP should demonstrate:

- strong domain modeling
- clear separation of control plane vs data plane
- reliable async propagation
- deterministic evaluation behavior
- low-latency reads via Redis projection
- auditability
- operational correctness and recovery

Admins manage flags and rollout rules in a web UI. Applications evaluate those flags through an API backed by Redis projections.

## MVP Boundaries

### Must Have

- organizations, projects, and environments
- simple role-based access in the admin UI and admin API
- feature flag CRUD
- per-environment flag configuration
- boolean and variant flags
- ordered targeting rules
- deterministic percentage rollout
- evaluation API
- JS SDK wrapper around the evaluation API
- Redis-backed environment projections
- transactional outbox propagation
- worker-driven projection refresh
- append-only audit logs
- reconciliation job that can rebuild projections from Postgres
- basic admin UI to manage flags, API keys, audit history, and preview evaluations

### Explicit Non-Goals

Do not implement these in the MVP:

- segments
- scheduled rollouts
- exposure event ingestion
- analytics dashboards
- environment diff view
- DLQ admin UI
- replay UI
- OpenFeature compliance
- streaming SDK connections
- client-side local evaluation
- advanced policy inheritance
- SSO and SAML
- billing
- mobile SDKs
- multi-region design

These may be mentioned as future extensions, but they are out of scope for V1.

## Core Architectural Story

The system must clearly separate:

### Control Plane

Used by admins and platform operators to:

- create and edit flags
- define rules
- manage environment configs
- manage API keys
- inspect audit logs

Control-plane writes go to Postgres as the source of truth.

### Data Plane

Used by evaluation clients to:

- evaluate one flag
- evaluate many flags for a user or request context

Data-plane reads go mostly to Redis environment projections.

This separation matters because:

- config correctness lives in Postgres
- low-latency reads come from Redis
- Redis is rebuildable, so recovery stays tractable

## Recommended Stack

- Frontend: Next.js + TypeScript
- API: Fastify + TypeScript + Zod
- Database: Postgres
- Cache and projection store: Redis
- Async jobs: Redis-backed queue or a simple polling worker
- Query layer: Kysely
- Repository layout: pnpm workspaces monorepo

This scope supports:

- a modern full-stack TypeScript implementation
- shared evaluation logic
- a clear control-plane and data-plane split
- realistic reliability patterns
- simple local development

## Monorepo Structure

```text
apps/
  web/
  api/
  worker/

packages/
  evaluation-core/
  shared/
  sdk-js/
  config/

infra/
  docker/
  migrations/

docs/
```

## Package Responsibilities

### `apps/web`

Admin console for:

- login and session handling
- organization, project, and environment selection
- flag list
- flag detail and edit pages
- preview evaluator
- audit history page
- API key management

### `apps/api`

HTTP API for:

- admin CRUD
- auth and session-backed access
- evaluation endpoints
- API key authentication for evaluation clients
- audit log reads
- preview evaluation

### `apps/worker`

Async worker for:

- outbox polling and processing
- projection rebuilds
- reconciliation jobs

### `packages/evaluation-core`

Pure business logic only. This package is one of the most important boundaries in the system.

It contains:

- rule matching logic
- percentage rollout hashing
- deterministic evaluation
- explainable reason generation
- projection typing

It must not contain:

- DB calls
- Redis calls
- HTTP framework coupling

### `packages/shared`

Shared schemas and utilities:

- Zod schemas
- DTO types
- validation helpers
- shared constants and enums

### `packages/sdk-js`

Thin JavaScript SDK for:

- evaluate one flag
- evaluate many flags
- attaching an API key
- basic client ergonomics

For the MVP, this is a wrapper around the evaluation API, not a local evaluation engine.

### `packages/config`

Shared runtime helpers for:

- environment variables
- config loading
- logger setup
- runtime config parsing

## What The MVP Should Feel Like

The finished system should feel like a real internal SaaS platform with:

- organization, project, and environment scoping
- role-gated admin functionality
- auditable configuration changes
- explainable evaluation results
- low-latency flag reads

It should feel more like:

- an internal platform team tool

It should feel less like:

- a consumer-facing polished product
- a large experimentation suite
- a general analytics platform
