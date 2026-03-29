# Domain Model

## Modeling Principles

- Use UUID primary keys everywhere.
- Include `created_at` and `updated_at` where appropriate.
- Prefer explicit enums or constrained text fields.
- Use strong uniqueness constraints.
- Keep the schema tight around the core control-plane and data-plane story.

## Tenant Hierarchy

The canonical hierarchy is:

`organization -> project -> environment -> flag configuration`

This gives:

- organizations as the tenant boundary
- projects as logical application or product groupings
- environments as isolated config scopes such as `dev`, `staging`, and `prod`

## Tables Included In MVP

- `users`
- `organizations`
- `memberships`
- `projects`
- `environments`
- `api_keys`
- `feature_flags`
- `flag_environment_configs`
- `flag_variants`
- `flag_rules`
- `audit_logs`
- `outbox_events`

## Explicitly Deferred Tables

Do not add these in the MVP:

- `segments`
- `segment_clauses`
- `scheduled_rollouts`
- `exposure_events`
- `exposure_hourly_aggregates`

## Canonical Tables

### `users`

Purpose: admin users who log into the web app.

Columns:

- `id`
- `email` unique not null
- `name` not null
- `created_at` not null default `now()`

Notes:

- Keep admin auth simple for V1.
- A local auth model or seeded dev login is enough.

### `organizations`

Purpose: tenant boundary.

Columns:

- `id`
- `name` not null
- `slug` unique not null
- `created_at` not null default `now()`

### `memberships`

Purpose: org-scoped RBAC.

Columns:

- `id`
- `organization_id` not null references `organizations(id)`
- `user_id` not null references `users(id)`
- `role` not null
- `created_at` not null default `now()`

Constraints:

- unique `organization_id, user_id`

Allowed roles:

- `owner`
- `admin`
- `developer`
- `viewer`

MVP permission model:

- `owner`, `admin`, and `developer` can manage flags, configs, and API keys
- `viewer` is read-only in the admin UI and admin API

### `projects`

Purpose: logical app or product grouping within an organization.

Columns:

- `id`
- `organization_id` not null references `organizations(id)`
- `name` not null
- `key` not null
- `created_at` not null default `now()`

Constraints:

- unique `organization_id, key`

### `environments`

Purpose: separate configs for `dev`, `staging`, and `prod`.

Columns:

- `id`
- `project_id` not null references `projects(id)`
- `key` not null
- `name` not null
- `sort_order` not null
- `created_at` not null default `now()`

Constraints:

- unique `project_id, key`

Seed defaults:

- `dev`
- `staging`
- `prod`

### `api_keys`

Purpose: authentication for evaluation clients.

Columns:

- `id`
- `environment_id` not null references `environments(id)`
- `name` not null
- `key_prefix` not null
- `key_hash` not null
- `status` not null
- `last_used_at` nullable
- `created_at` not null default `now()`
- `revoked_at` nullable

Indexes:

- index on `environment_id`
- index on `key_prefix`

Allowed status values:

- `active`
- `revoked`

Notes:

- Store only the hash, never the raw key.
- Return the raw key only once at creation time.
- Use the prefix for operational identification.

### `feature_flags`

Purpose: core flag definition at project scope.

Columns:

- `id`
- `project_id` not null references `projects(id)`
- `key` not null
- `name` not null
- `description` nullable
- `flag_type` not null
- `status` not null
- `created_by_user_id` not null references `users(id)`
- `created_at` not null default `now()`
- `updated_at` not null default `now()`

Constraints:

- unique `project_id, key`

Allowed `flag_type` values:

- `boolean`
- `variant`

Allowed `status` values:

- `active`
- `archived`

Notes:

- Keep archived flags for auditability.
- Do not hard-delete flags in normal flows.

### `flag_environment_configs`

Purpose: per-environment state and default resolution.

Columns:

- `id`
- `feature_flag_id` not null references `feature_flags(id)`
- `environment_id` not null references `environments(id)`
- `enabled` not null
- `default_variant_key` not null
- `projection_version` not null
- `updated_by_user_id` not null references `users(id)`
- `updated_at` not null default `now()`

Constraints:

- unique `feature_flag_id, environment_id`

Important note:

- Use `projection_version`, not a generic `config_version`.
- This version exists to manage async propagation and projection freshness.

Version behavior:

- bump `projection_version` every time this environment config or its rule or variant configuration changes in a way that affects evaluation

### `flag_variants`

Purpose: allowed values for boolean or variant flags.

Columns:

- `id`
- `feature_flag_id` not null references `feature_flags(id)`
- `key` not null
- `value_json` not null
- `description` nullable

Constraints:

- unique `feature_flag_id, key`

Notes:

- Boolean flags can still model variants explicitly as `on` and `off`.
- This keeps the evaluator uniform and simplifies V1.

### `flag_rules`

Purpose: ordered evaluation rules per environment config.

Columns:

- `id`
- `flag_environment_config_id` not null references `flag_environment_configs(id)`
- `sort_order` not null
- `rule_type` not null
- `attribute_key` nullable
- `operator` nullable
- `comparison_value_json` nullable
- `rollout_percentage` nullable
- `variant_key` not null
- `created_at` not null default `now()`

Constraints:

- unique `flag_environment_config_id, sort_order`

Allowed `rule_type` values:

- `attribute_match`
- `percentage_rollout`

Allowed operators for `attribute_match` in MVP:

- `equals`
- `in`

Notes:

- Ordered rules are required.
- First matching rule wins.
- `percentage_rollout` uses deterministic stable hashing.
- Do not add `segment_match` in V1.

### `audit_logs`

Purpose: append-only audit trail.

Columns:

- `id`
- `organization_id` not null references `organizations(id)`
- `project_id` nullable references `projects(id)`
- `environment_id` nullable references `environments(id)`
- `actor_user_id` not null references `users(id)`
- `entity_type` not null
- `entity_id` not null
- `action` not null
- `before_json` nullable
- `after_json` nullable
- `request_id` not null
- `created_at` not null default `now()`

Indexes:

- `organization_id, created_at desc`
- `entity_type, entity_id, created_at desc`

Canonical action names:

- `flag.created`
- `flag.updated`
- `flag.archived`
- `flag.env_config.updated`
- `flag.rules.updated`
- `api_key.created`
- `api_key.revoked`

Important:

- This table is append-only.
- Never update audit log rows.

### `outbox_events`

Purpose: reliable propagation from Postgres writes to async projection updates.

Columns:

- `id`
- `event_type` not null
- `aggregate_type` not null
- `aggregate_id` not null
- `payload_json` not null
- `idempotency_key` not null
- `status` not null
- `available_at` not null default `now()`
- `published_at` nullable
- `attempt_count` not null default `0`
- `last_error` nullable
- `created_at` not null default `now()`

Indexes:

- `status, available_at`
- unique `idempotency_key`

Allowed status values:

- `pending`
- `published`
- `failed`

Event types for MVP:

- `flag_projection_refresh_requested`

Optional future event types:

- `api_key_created`
- `api_key_revoked`

The only essential outbox event for V1 is `flag_projection_refresh_requested`.

## Redis Projection Model

For the MVP, store one compiled environment projection blob per environment.

Redis key shape:

```text
ff:env_projection:{environmentId}
```

Projection contents:

- `environmentId`
- `projectId`
- `organizationId`
- `projectionVersion`
- `generatedAt`
- `flags`

Each flag entry contains:

- `flagKey`
- `flagType`
- `status`
- `enabled`
- `defaultVariantKey`
- `variants`
- `rules`
- `flagEnvironmentConfigId`
- `projectionVersion`

Each compiled rule contains:

- `ruleId`
- `sortOrder`
- `ruleType`
- `attributeKey`
- `operator`
- `comparisonValue`
- `rolloutPercentage`
- `variantKey`

Why environment-level blobs are the canonical V1 model:

- one read per evaluation request
- easy versioning
- easy rebuild behavior
- straightforward staleness reasoning
- fewer moving parts than many Redis keys
