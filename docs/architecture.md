# Architecture

## System Overview

The MVP intentionally separates a control plane from a data plane.

### Control Plane

Used by admins to:

- create and edit flags
- define per-environment configs
- manage variants and targeting rules
- manage API keys
- review audit history

Storage and correctness model:

- Postgres is the source of truth
- control-plane writes are transactional
- Redis is never written as the source of truth

### Data Plane

Used by applications to:

- evaluate one flag
- evaluate many flags

Read model:

- API-key-authenticated evaluation requests read compiled environment projections from Redis
- the evaluator runs against the compiled projection

This split exists because:

- correctness and recovery belong in Postgres
- low-latency reads belong in Redis
- rebuildable projections keep recovery and reconciliation tractable

## Pure Evaluation Core

`packages/evaluation-core` is a pure package with no DB, Redis, or HTTP coupling.

It owns:

- projection types
- ordered rule evaluation
- attribute matching
- deterministic percentage rollout
- explainable result generation

This boundary is intentionally strict because it keeps evaluation deterministic, testable, and reusable.

## Evaluation Model

### Inputs

The evaluator consumes:

- a compiled environment projection
- a `flagKey`
- an evaluation context object

The context can contain:

- `userId`
- `email`
- `country`
- `plan`
- arbitrary string-based attributes

For MVP simplicity, treat context attributes as string-based values.

### Evaluation Order

For one flag:

1. Look up the flag in the environment projection.
2. If the flag does not exist, return `FLAG_NOT_FOUND`.
3. If the flag is archived or otherwise unavailable, treat it as unavailable.
4. If the environment config is disabled, return the default variant with reason `DISABLED`.
5. Evaluate ordered rules from lowest `sortOrder` to highest.
6. The first matching rule wins.
7. If no rule matches, return the default variant with reason `DEFAULT`.
8. Resolve the final variant value.
9. Return an explainable result including reason, matched rule, and projection version.

### Percentage Rollout

Percentage rollout rules require a stable subject key.

Canonical subject key derivation:

- use `context.userId` when present
- otherwise fall back to an explicit `subjectKey` supplied in the evaluation context

Stable hash input:

`flagKey + environmentId + subjectKey`

Bucket model:

- hash to an integer bucket from `0` to `9999`
- compare against a threshold derived from the rollout percentage

Example:

- `20%` rollout means `bucket < 2000`

This ensures stable assignment and prevents user flipping between variants.

### Evaluation Result Shape

```ts
type EvaluationResult = {
  flagKey: string;
  variantKey: string | null;
  value: unknown;
  reason:
    | "FLAG_NOT_FOUND"
    | "DISABLED"
    | "RULE_MATCH"
    | "DEFAULT"
    | "INVALID_CONTEXT";
  matchedRuleId: string | null;
  projectionVersion: number | null;
};
```

Explainability is part of the product, not an afterthought.

## Transactional Write Model

Any control-plane write that affects evaluation behavior must do all of the following inside one Postgres transaction:

- update source-of-truth rows
- bump the relevant `projection_version`
- append an audit log row
- insert a pending outbox event

Do not do dual writes such as:

- write Postgres first
- update Redis directly later in the request
- append the audit log separately

That weakens consistency and makes the system story less defensible.

## Outbox Design

Keep the outbox simple.

### Canonical Outbox Event

The essential V1 event is:

- `flag_projection_refresh_requested`

Its payload only needs:

- `organizationId`
- `projectId`
- `environmentId`
- optional `reason`
- optional `triggeredByUserId`

### Producer Behavior

When admin configuration changes affect evaluation:

- insert a pending outbox row inside the same transaction as the source-of-truth write

### Worker Behavior

The worker should:

1. Poll pending outbox rows ordered by `created_at`.
2. Claim a batch.
3. Rebuild the affected environment projection from Postgres.
4. Write the rebuilt projection to Redis.
5. Mark the outbox row as `published`.
6. Retry failures with backoff.
7. Mark rows `failed` after max attempts.

For V1, a DB-polled outbox worker is the preferred design. There is no need for an extra broker hop such as:

`outbox row -> Redis queue -> consumer`

The outbox itself is already the durable propagation intent.

## Idempotency Model

The worker must be safe if it processes the same outbox event more than once.

The canonical V1 idempotency model is:

- rebuild the full environment projection from current Postgres state
- overwrite the Redis projection
- rely on `projection_version` and source-of-truth recomputation

This means replaying a projection refresh is naturally safe.

Do not add a separate processed-events table in the MVP unless a later requirement makes it necessary.

## Projection Rebuild Strategy

Do not try to maintain fine-grained Redis patches in V1.

When an environment changes:

- rebuild the full environment projection from Postgres
- overwrite the Redis blob

Why this is the canonical MVP choice:

- simpler correctness
- safer idempotency
- easier debugging
- easier reconciliation
- smaller worker surface area
- acceptable because environment config size is modest in V1

## Reconciliation Job

The MVP must include reconciliation.

Purpose:

- repair Redis drift
- recover from missed async work
- restore projections after bugs or outages

Behavior:

- periodically scan environments from Postgres
- rebuild each source-of-truth projection
- compare with the Redis projection version or checksum
- overwrite Redis when the projection is missing or stale

This can run every few minutes. A background job plus logs is enough for V1.

## Admin UI Surfaces

The MVP admin UI should include:

1. Login page
2. Organization, project, and environment selector
3. Flag list page
4. Flag detail page
5. Preview evaluator panel
6. Audit log page
7. API keys page

The flag detail page is the main control surface. It should expose:

- metadata
- variants
- per-environment enabled state
- default variant
- ordered rules editor
- preview evaluation
- archive action

The rule builder should be form-based and streamlined.

## Auth Scope

Keep authentication and authorization simple in V1.

- Admin UI can use simple local auth or a seeded dev login.
- Evaluation API uses environment-scoped API keys.
- Organization membership authorizes admin actions.

Do not add:

- OAuth
- SSO
- password reset
- invite flows

Seed one organization and one owner user for demo purposes.

## JS SDK Scope

`packages/sdk-js` should remain thin.

It supports:

- initialization with base URL and API key
- `evaluate(flagKey, context)`
- `evaluateMany(flagKeys, context)`

It does not support in V1:

- streaming updates
- background refresh
- local evaluation
- exposure event tracking

This is enough to prove a realistic integration surface without adding client-side config distribution complexity.

## Tradeoffs To Document

These decisions should be called out explicitly in the final architecture docs:

### Why full projection rebuilds instead of patch updates?

- simpler correctness
- safer idempotency
- easier reconciliation
- acceptable cost at MVP scale

### Why Redis as projection, not source of truth?

- Postgres stays correct and recoverable
- Redis can be rebuilt at any time
- operational recovery remains tractable

### Why a DB-polled outbox worker instead of a more elaborate broker pipeline?

- transactional outbox already provides durable propagation intent
- direct worker polling minimizes moving parts
- the flow is easier to reason about in V1

### Why API-evaluated SDK instead of local evaluation?

- simpler to ship
- avoids local cache invalidation and client-side config distribution
- still proves evaluator and API design

### Why no segments initially?

- inline rules already prove targeting behavior
- segments add compile and invalidation complexity
- reusable targeting abstractions can be layered in later
