# API

## Auth Model

### Admin Auth

For the MVP, admin auth stays simple:

- local auth or seeded dev login
- cookie session auth for admin routes
- current user membership determines org-scoped permissions

Do not overbuild auth in V1.

### Evaluation Auth

Data-plane evaluation routes use environment-scoped API keys, not admin sessions.

API key rules:

- store only `key_hash`
- expose raw plaintext only once at creation time
- use `key_prefix` for operational visibility
- revoked keys must fail authentication

## Evaluation Contract

Canonical single-flag result:

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

The response must be explainable enough to support admin previews and operational debugging.

Canonical batch result:

```ts
type EvaluationBatchResult = Record<string, EvaluationResult>;
```

## Admin Routes

### Session and Current User

#### `POST /api/admin/session/login`

Purpose:

- establish an admin session

#### `POST /api/admin/session/logout`

Purpose:

- clear the current admin session

#### `GET /api/admin/me`

Purpose:

- return the current user and org memberships

### Organization and Context Lookup

#### `GET /api/admin/organizations`

Purpose:

- return organizations the current user belongs to

#### `GET /api/admin/organizations/:organizationId/projects`

Purpose:

- return projects for an organization

#### `GET /api/admin/projects/:projectId/environments`

Purpose:

- return environments for a project

### Flag CRUD

#### `GET /api/admin/projects/:projectId/flags`

Purpose:

- list flags in a project

Supports:

- search by key or name
- filter by status

Summary response fields:

- `id`
- `key`
- `name`
- `flagType`
- `status`
- `updatedAt`

#### `POST /api/admin/projects/:projectId/flags`

Purpose:

- create a new flag

Body:

```json
{
  "key": "new_checkout",
  "name": "New Checkout",
  "description": "Roll out the new checkout experience",
  "flagType": "boolean"
}
```

Transactional side effects:

- insert `feature_flags`
- create default environment configs for all project environments
- create default variants
- append an audit log row
- enqueue projection refresh outbox rows for affected environments

#### `GET /api/admin/flags/:flagId`

Purpose:

- return full flag details for the detail page

Response should include:

- flag metadata
- variants
- environment configs
- rules grouped per environment

#### `PATCH /api/admin/flags/:flagId`

Purpose:

- update flag metadata

Allowed fields:

- `name`
- `description`
- `status`

Behavior:

- append an audit row
- enqueue projection refresh for affected environments if evaluation semantics changed

#### `POST /api/admin/flags/:flagId/archive`

Purpose:

- archive a flag instead of deleting it

This is preferred for auditability.

### Canonical Configuration Replacement Route

#### `PUT /api/admin/flags/:flagId/configuration`

Purpose:

- replace the editable flag configuration in one structured payload

This route is the preferred MVP simplification instead of many small CRUD endpoints.

It updates:

- variants
- per-environment enabled state
- per-environment default variant
- ordered rules per environment

Conceptual request body:

```json
{
  "variants": [
    { "key": "on", "value": true, "description": "Enabled" },
    { "key": "off", "value": false, "description": "Disabled" }
  ],
  "environments": [
    {
      "environmentId": "env_1",
      "enabled": true,
      "defaultVariantKey": "off",
      "rules": [
        {
          "sortOrder": 1,
          "ruleType": "attribute_match",
          "attributeKey": "email",
          "operator": "in",
          "comparisonValue": ["alice@example.com"],
          "variantKey": "on"
        },
        {
          "sortOrder": 2,
          "ruleType": "percentage_rollout",
          "rolloutPercentage": 20,
          "variantKey": "on"
        }
      ]
    }
  ]
}
```

Behavior:

- validate the full payload
- replace variants, rules, and config state transactionally
- bump `projection_version` for affected environment configs
- append audit logs
- enqueue one projection refresh outbox event per affected environment

### Preview Evaluation

#### `POST /api/admin/flags/:flagId/preview`

Purpose:

- preview how a sample context evaluates for a chosen environment

Body:

```json
{
  "environmentId": "env_1",
  "context": {
    "userId": "user_123",
    "email": "alice@example.com",
    "plan": "pro"
  }
}
```

Behavior:

- load the latest environment projection
- evaluate the flag through the pure evaluator
- return the explainable evaluation result

This route is important both for the UI and for demonstrating evaluator correctness.

### Audit Logs

#### `GET /api/admin/organizations/:organizationId/audit-logs`

Purpose:

- list org audit history

Supported filters:

- project
- environment
- entity type
- date range
- pagination

#### `GET /api/admin/entities/:entityType/:entityId/audit-logs`

Purpose:

- show entity-specific history, such as all changes for one flag

### API Keys

#### `GET /api/admin/environments/:environmentId/api-keys`

Purpose:

- list API keys for an environment

Response fields:

- `id`
- `name`
- `keyPrefix`
- `status`
- `lastUsedAt`
- `createdAt`
- `revokedAt`

#### `POST /api/admin/environments/:environmentId/api-keys`

Purpose:

- create a new evaluation API key

Body:

```json
{
  "name": "Checkout Web App"
}
```

Response:

- created key metadata
- raw plaintext key shown once

Behavior:

- insert hashed key
- append audit log row

#### `POST /api/admin/api-keys/:apiKeyId/revoke`

Purpose:

- revoke an API key

Behavior:

- update status
- set `revoked_at`
- append audit log row

## Evaluation Routes

### `POST /api/evaluate`

Purpose:

- evaluate one flag

Headers:

- evaluation API key

Body:

```json
{
  "flagKey": "new_checkout",
  "context": {
    "userId": "user_123",
    "email": "alice@example.com",
    "plan": "pro"
  }
}
```

Flow:

- authenticate API key
- resolve the environment from the key
- load the environment projection from Redis
- evaluate
- return the explainable result

### `POST /api/evaluate/batch`

Purpose:

- evaluate many flags in one request

Headers:

- evaluation API key

Body:

```json
{
  "flagKeys": ["new_checkout", "new_nav"],
  "context": {
    "userId": "user_123",
    "email": "alice@example.com",
    "plan": "pro"
  }
}
```

Response:

- a keyed object of explainable evaluation results for each requested flag

Conceptual response:

```json
{
  "new_checkout": {
    "flagKey": "new_checkout",
    "variantKey": "on",
    "value": true,
    "reason": "RULE_MATCH",
    "matchedRuleId": "rule_allowlist",
    "projectionVersion": 12
  },
  "new_nav": {
    "flagKey": "new_nav",
    "variantKey": "off",
    "value": false,
    "reason": "DEFAULT",
    "matchedRuleId": null,
    "projectionVersion": 12
  }
}
```

Batch evaluation stays in scope because it is realistic and only modestly more complex if the evaluator is clean.

## JS SDK

`packages/sdk-js` is a thin wrapper around the public evaluation API.

Example:

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

## Health and Internal Routes

### `GET /health/live`

Purpose:

- basic liveness

### `GET /health/ready`

Purpose:

- verify the API can talk to Postgres and Redis

### `GET /internal/projection-status/:environmentId`

Purpose:

- internal-only debugging endpoint for projection freshness

Suggested response fields:

- current Redis projection version
- generated time

This is optional but useful for development and demo workflows.
