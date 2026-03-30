import assert from "node:assert/strict";
import test from "node:test";
import {
  type EnvironmentProjectionSource,
  compileEnvironmentProjection,
} from "./environment-projection";

function createSource(
  overrides: Partial<EnvironmentProjectionSource> = {},
): EnvironmentProjectionSource {
  return {
    environmentId: "env_staging",
    flags: [
      {
        defaultVariantKey: "off",
        enabled: true,
        flagEnvironmentConfigId: "cfg_checkout",
        flagKey: "new_checkout",
        flagType: "boolean",
        projectionVersion: 7,
        rules: [
          {
            attributeKey: null,
            comparisonValue: null,
            createdAt: new Date("2026-03-29T18:05:00.000Z"),
            id: "rule_rollout",
            operator: null,
            rolloutPercentage: 25,
            ruleType: "percentage_rollout",
            sortOrder: 20,
            variantKey: "on",
          },
          {
            attributeKey: "email",
            comparisonValue: "alice@example.com",
            createdAt: new Date("2026-03-29T18:00:00.000Z"),
            id: "rule_email",
            operator: "equals",
            rolloutPercentage: null,
            ruleType: "attribute_match",
            sortOrder: 10,
            variantKey: "on",
          },
        ],
        status: "active",
        variants: [
          {
            description: "Disabled",
            key: "off",
            value: false,
          },
          {
            description: "Enabled",
            key: "on",
            value: true,
          },
        ],
      },
      {
        defaultVariantKey: "control",
        enabled: false,
        flagEnvironmentConfigId: "cfg_nav",
        flagKey: "new_nav",
        flagType: "variant",
        projectionVersion: 11,
        rules: [],
        status: "archived",
        variants: [
          {
            description: "Control",
            key: "control",
            value: "control",
          },
          {
            description: null,
            key: "treatment",
            value: "treatment",
          },
        ],
      },
    ],
    organizationId: "org_acme",
    projectId: "proj_checkout",
    ...overrides,
  };
}

test("compiles one environment projection into the evaluation-core shape", () => {
  const projection = compileEnvironmentProjection(
    createSource(),
    new Date("2026-03-29T19:00:00.000Z"),
  );

  assert.deepEqual(projection, {
    environmentId: "env_staging",
    flags: {
      new_checkout: {
        defaultVariantKey: "off",
        enabled: true,
        flagEnvironmentConfigId: "cfg_checkout",
        flagKey: "new_checkout",
        flagType: "boolean",
        projectionVersion: 7,
        rules: [
          {
            attributeKey: "email",
            comparisonValue: "alice@example.com",
            operator: "equals",
            ruleId: "rule_email",
            ruleType: "attribute_match",
            sortOrder: 10,
            variantKey: "on",
          },
          {
            rolloutPercentage: 25,
            ruleId: "rule_rollout",
            ruleType: "percentage_rollout",
            sortOrder: 20,
            variantKey: "on",
          },
        ],
        status: "active",
        variants: {
          off: {
            description: "Disabled",
            key: "off",
            value: false,
          },
          on: {
            description: "Enabled",
            key: "on",
            value: true,
          },
        },
      },
      new_nav: {
        defaultVariantKey: "control",
        enabled: false,
        flagEnvironmentConfigId: "cfg_nav",
        flagKey: "new_nav",
        flagType: "variant",
        projectionVersion: 11,
        rules: [],
        status: "archived",
        variants: {
          control: {
            description: "Control",
            key: "control",
            value: "control",
          },
          treatment: {
            key: "treatment",
            value: "treatment",
          },
        },
      },
    },
    generatedAt: "2026-03-29T19:00:00.000Z",
    organizationId: "org_acme",
    projectId: "proj_checkout",
    projectionVersion: 11,
  });
});

test("returns an empty projection with version zero when the environment has no flags", () => {
  const projection = compileEnvironmentProjection(
    createSource({flags: []}),
    new Date("2026-03-29T20:00:00.000Z"),
  );

  assert.deepEqual(projection, {
    environmentId: "env_staging",
    flags: {},
    generatedAt: "2026-03-29T20:00:00.000Z",
    organizationId: "org_acme",
    projectId: "proj_checkout",
    projectionVersion: 0,
  });
});
