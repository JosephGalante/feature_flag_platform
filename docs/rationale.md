# Rationale

This document captures the main MVP tradeoffs behind the implementation.

## Postgres Is The Source Of Truth

All control-plane correctness lives in Postgres.

Why:

- relational consistency matters more than raw read speed for admin writes
- auditability is straightforward
- recovery stays defensible because Redis can always be rebuilt

Consequence:

- Redis is treated as a projection, not an authoritative store

## Redis Stores Full Environment Projections

The runtime reads a compiled blob per environment instead of normalized Postgres rows.

Why:

- evaluation stays fast and simple
- the public API and preview evaluator use the same compiled shape
- worker rebuilds remain deterministic and idempotent

Consequence:

- the system pays rebuild cost on changes instead of maintaining fragile partial patches

## Full Rebuilds Beat Fine-Grained Redis Patches In V1

When an environment changes, the worker rebuilds the full projection and overwrites Redis.

Why:

- easier correctness story
- easier replay and retry behavior
- easier debugging and reconciliation
- good enough for MVP-sized environment payloads

Consequence:

- some extra write work is accepted in exchange for much lower operational complexity

## Transactional Outbox Instead Of Dual Writes

Evaluation-affecting writes append source rows, audit rows, and outbox rows in one Postgres transaction.

Why:

- avoids request-time Postgres + Redis dual-write coupling
- preserves a durable propagation intent
- makes async propagation explicit and recoverable

Consequence:

- Redis updates are asynchronous by design

## DB-Polled Worker Instead Of A Broker Pipeline

The worker polls `outbox_events` directly.

Why:

- fewer moving parts for the MVP
- the outbox is already the durable queue of work
- easier to explain in an interview or architecture review

Consequence:

- throughput and scheduling sophistication are intentionally modest in V1

## Reconciliation Is A First-Class Recovery Path

The worker periodically compares Postgres state to Redis projections and repairs drift.

Why:

- async systems eventually miss work during bugs, crashes, or outages
- a rebuildable projection model is only credible if repair exists
- it strengthens the operational story beyond the happy path

Consequence:

- Redis correctness does not depend solely on the outbox path being perfect

## API-Evaluated SDK Instead Of Local Evaluation

The JavaScript SDK wraps the public evaluation API instead of shipping local flag evaluation.

Why:

- faster MVP delivery
- no client-side cache invalidation problem
- no config distribution protocol to design yet
- still proves a realistic consumer integration surface

Consequence:

- latency depends on the runtime API, not an in-process cache

## Simple Admin Auth And Org-Scoped RBAC

The admin side uses seeded dev login and org-scoped roles.

Why:

- enough to prove tenant boundaries and permissions
- avoids spending MVP time on OAuth, SSO, invites, and password recovery

Consequence:

- auth is intentionally not production-grade identity infrastructure yet
