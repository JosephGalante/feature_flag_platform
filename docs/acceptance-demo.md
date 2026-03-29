# Acceptance And Demo

## What Success Looks Like

By the end of the MVP, the platform should clearly demonstrate:

- multi-tenant control-plane modeling
- deterministic flag evaluation
- low-latency Redis-backed reads
- explainable evaluation output
- append-only auditability
- reliable async propagation from Postgres to Redis
- operational recovery through reconciliation

The project should feel like a serious internal platform tool, not a toy toggle app.

## Canonical Demo Flow

The expected end-to-end demo is:

1. Log into a seeded admin UI.
2. Open a seeded project and choose the `staging` environment.
3. Create a flag named `new_checkout`.
4. Set the default variant to `off`.
5. Add an attribute match rule:
  if `email` is in a configured list, return `on`.
6. Add a percentage rollout rule:
  `20%` rollout returns `on`.
7. Save the configuration.
8. Show that an append-only audit entry was created.
9. Explain that Postgres is the source of truth and Redis updates asynchronously through the outbox worker.
10. Preview evaluations for sample users in the admin UI.
11. Show deterministic and explainable results, including reason, matched rule, and projection version.
12. Evaluate the same flag through the API or JS SDK.
13. Optionally show projection freshness or a reconciliation repair path.

## What The Demo Should Prove

### Product Story

- admins can manage flags in a realistic multi-tenant UI
- evaluation clients consume flags through a clean API
- the SDK gives consumers a thin integration surface

### Architecture Story

- control-plane correctness lives in Postgres
- data-plane speed comes from Redis
- the projection is rebuildable and not authoritative
- evaluation logic is isolated in a pure shared package

### Reliability Story

- evaluation-affecting writes create audit logs and outbox work transactionally
- projection updates happen asynchronously
- the worker is safe to replay because projection rebuilds are idempotent
- reconciliation repairs stale or missing Redis state

## Minimum Acceptance Checklist

- seeded org, project, environments, and owner user exist
- flags can be created, viewed, edited, and archived
- variants and per-environment rules can be configured
- ordered rules evaluate deterministically
- percentage rollout is stable for the same subject
- evaluation responses are explainable
- environment projections are stored in Redis
- evaluation reads from Redis, not directly from Postgres
- audit logs are append-only
- outbox rows are written transactionally with config changes
- worker rebuilds projections and marks outbox progress
- reconciliation can restore missing or stale projections
- the JS SDK can evaluate one or many flags through the API

