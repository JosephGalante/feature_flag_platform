# Feature Flag Platform

Status: planning and specification only. This repository currently contains canonical docs for the MVP and does not yet contain implementation code.

## Overview

This project is a serious V1 multi-tenant feature flag platform for internal B2B-style usage.

It is intentionally:

- not a toy toggle app
- not a LaunchDarkly clone
- focused on strong domain modeling, deterministic evaluation, and operational correctness

The core system story is:

- admins manage flags and rollout configuration through a control plane backed by Postgres
- applications evaluate flags through a data plane backed by Redis environment projections
- async propagation is handled through a transactional outbox, a worker, and reconciliation

## Canonical Docs

- [docs/mvp-spec.md](docs/mvp-spec.md): product scope, stack, repo layout, and package responsibilities
- [docs/domain-model.md](docs/domain-model.md): canonical tables, enums, constraints, and Redis projection model
- [docs/architecture.md](docs/architecture.md): control plane and data plane design, evaluator behavior, propagation, recovery, and tradeoffs
- [docs/api.md](docs/api.md): admin API, evaluation API, auth model, and response contracts
- [docs/build-plan.md](docs/build-plan.md): exact phased implementation order and deferred scope
- [docs/acceptance-demo.md](docs/acceptance-demo.md): MVP success criteria and end-to-end demo flow

## MVP Summary

The MVP must support:

- organizations, projects, and environments
- simple org-scoped RBAC for the admin UI and admin API
- feature flag CRUD
- per-environment flag configuration
- boolean and variant flags
- ordered targeting rules
- deterministic percentage rollout
- evaluation API
- thin JavaScript SDK wrapper around the evaluation API
- Redis-backed environment projections for low-latency reads
- transactional outbox propagation
- worker-driven projection rebuilds
- append-only audit logs
- reconciliation to repair or rebuild projections from Postgres
- a basic admin UI for managing flags, API keys, audit history, and preview evaluation

## Explicit Non-Goals

The MVP intentionally excludes:

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

## Design Principles

- Postgres is the source of truth.
- Redis is a rebuildable projection, not an authoritative store.
- Evaluation logic lives in a pure shared package with no IO coupling.
- Any write that changes evaluation behavior must update source rows, bump projection versions, write an audit row, and enqueue outbox work in one database transaction.
- The worker should rebuild full environment projections rather than maintain partial Redis patches.
- Reconciliation is a first-class recovery mechanism, not an afterthought.

## Target Demo

The expected MVP demo is:

1. Log into a seeded admin UI.
2. Open a project and choose the `staging` environment.
3. Create a flag called `new_checkout`.
4. Set the default variant to `off`.
5. Add an allowlist rule for specific emails and a `20%` rollout rule.
6. Save configuration and show the append-only audit entry.
7. Explain that Postgres is the source of truth and Redis updates asynchronously through the outbox worker.
8. Preview evaluations for sample users and show deterministic, explainable results.
9. Evaluate through the API or JS SDK.
10. Optionally show Redis projection freshness or reconciliation behavior.
