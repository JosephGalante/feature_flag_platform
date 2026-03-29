# Build Plan

## Purpose

This implementation order is optimized to finish quickly while preserving the intended architecture.

The plan intentionally builds correctness and clarity before polish.

## Phase 0: Repo And Dev Infrastructure

Implement:

- pnpm monorepo
- Docker Compose for Postgres and Redis
- TypeScript setup
- linting and formatting
- migration setup
- basic app bootstraps

Deliverable:

- apps start locally
- DB migrations run
- Redis is reachable

## Phase 1: Core Schema And Seeded Multi-Tenant Model

Implement:

- `users`
- `organizations`
- `memberships`
- `projects`
- `environments`
- `feature_flags`
- `flag_environment_configs`
- `flag_variants`
- `flag_rules`
- `api_keys`
- `audit_logs`
- `outbox_events`

Also:

- seed one demo org
- seed one project
- seed default environments
- seed one owner user

Deliverable:

- the database is modeled correctly
- tenant boundaries are in place

## Phase 2: Pure Evaluation Engine

Implement `packages/evaluation-core` first.

Features:

- variant lookup
- ordered rule evaluation
- attribute match rules
- percentage rollout
- deterministic hashing
- explainable result shape

Testing:

- strong unit test coverage

Deliverable:

- given a projection and context, the evaluator returns the correct result deterministically

This phase should finish before UI complexity is introduced.

## Phase 3: Admin CRUD API

Implement admin routes for:

- organizations, projects, and environments lookup
- flags list, detail, create, update, and archive
- configuration replacement
- audit log reads
- API key creation, listing, and revocation

Deliverable:

- source-of-truth CRUD works entirely in Postgres
- Redis is not yet required for the basic control-plane story

For early testing, evaluation may temporarily read from Postgres before the projection path exists.

## Phase 4: Basic Admin UI

Implement:

- login and session handling
- context switching
- flag list page
- flag detail and edit page
- API keys page
- audit log page

Deliverable:

- flags and API keys can be managed end-to-end from the UI

Do not over-polish the UI yet.

## Phase 5: Projection Builder And Redis Read Path

Implement:

- environment projection builder from Postgres
- Redis storage format
- projection load helper
- evaluation route reads from Redis
- admin preview route reads from Redis

Deliverable:

- evaluation now uses Redis projections
- the system visibly has a control-plane and data-plane split

At this point, the project is already a solid core platform.

## Phase 6: Transactional Outbox And Worker

Implement:

- outbox writes inside evaluation-affecting transactions
- worker polling pending outbox rows
- full environment projection rebuilds
- Redis overwrite on rebuild
- retry and backoff behavior
- outbox rows marked `published` or `failed`

Deliverable:

- config changes propagate asynchronously to Redis
- the reliability story becomes real

## Phase 7: Reconciliation Job

Implement:

- periodic environment scan
- rebuild from Postgres
- compare with Redis
- repair stale or missing projections

Deliverable:

- drift repair exists
- operational maturity improves significantly

## Phase 8: SDK And Portfolio Polish

Implement:

- thin JS SDK
- README polish
- architecture diagram
- seed demo data
- screenshots
- local run instructions
- short rationale doc explaining tradeoffs

Deliverable:

- the project is portfolio-ready

## Explicitly Deferred Features

### Segments

Why deferred:

- introduces reusable targeting abstractions
- adds compile and invalidation complexity
- not required to prove evaluator design

### Scheduled Rollouts

Why deferred:

- introduces worker claiming and state machine complexity
- not required for the core propagation model

### Exposure Events And Metrics

Why deferred:

- adds ingestion and aggregation complexity
- not central to flag evaluation architecture

### Ops Dashboard

Why deferred:

- logs and internal status routes are enough in MVP
- UI for ops is helpful, but not core

### Replay Tooling

Why deferred:

- useful, but not necessary when reconciliation already handles recovery in V1

### Fine-Grained RBAC

Why deferred:

- org-scoped roles are enough for the MVP
