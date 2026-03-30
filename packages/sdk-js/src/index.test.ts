import assert from "node:assert/strict";
import test from "node:test";
import {FeatureFlagApiError, FeatureFlagClient} from "./index";

test("posts evaluation requests with the API key header and returns the result", async () => {
  const requests: Array<{body: unknown; headers: Headers; method: string; url: string}> = [];
  const expectedResult = {
    flagKey: "new_checkout",
    matchedRuleId: "rule_1",
    projectionVersion: 8,
    reason: "RULE_MATCH",
    value: true,
    variantKey: "on",
  };

  const client = new FeatureFlagClient({
    apiKey: "sdk_test_key",
    baseUrl: "http://localhost:4000/",
    fetch: async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(JSON.stringify(expectedResult), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
  });

  const result = await client.evaluate("  new_checkout  ", {
    email: "owner@acme.test",
  });

  assert.deepEqual(result, expectedResult);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    body: {
      context: {
        email: "owner@acme.test",
      },
      flagKey: "new_checkout",
    },
    headers: new Headers({
      "content-type": "application/json",
      "x-api-key": "sdk_test_key",
    }),
    method: "POST",
    url: "http://localhost:4000/api/evaluate",
  });
});

test("posts batch evaluation requests and returns the result map", async () => {
  const requests: Array<{body: unknown; headers: Headers; method: string; url: string}> = [];
  const expectedResult = {
    checkout_redesign: {
      flagKey: "checkout_redesign",
      matchedRuleId: null,
      projectionVersion: 8,
      reason: "DEFAULT",
      value: false,
      variantKey: "off",
    },
    search_refresh: {
      flagKey: "search_refresh",
      matchedRuleId: "rule_beta",
      projectionVersion: 8,
      reason: "RULE_MATCH",
      value: true,
      variantKey: "on",
    },
  };

  const client = new FeatureFlagClient({
    apiKey: "sdk_test_key",
    baseUrl: "http://localhost:4000/",
    fetch: async (input, init) => {
      requests.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        headers: new Headers(init?.headers),
        method: init?.method ?? "GET",
        url: String(input),
      });

      return new Response(JSON.stringify(expectedResult), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      });
    },
  });

  const result = await client.evaluateMany(["  checkout_redesign  ", "search_refresh"], {
    userId: "user_123",
  });

  assert.deepEqual(result, expectedResult);
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0], {
    body: {
      context: {
        userId: "user_123",
      },
      flagKeys: ["checkout_redesign", "search_refresh"],
    },
    headers: new Headers({
      "content-type": "application/json",
      "x-api-key": "sdk_test_key",
    }),
    method: "POST",
    url: "http://localhost:4000/api/evaluate/batch",
  });
});

test("throws a typed API error when evaluation fails", async () => {
  const client = new FeatureFlagClient({
    apiKey: "sdk_test_key",
    baseUrl: "http://localhost:4000",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: "INVALID_API_KEY",
          message: "A valid evaluation API key is required.",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 401,
        },
      ),
  });

  await assert.rejects(
    async () => await client.evaluate("new_checkout"),
    (error: unknown) => {
      assert.ok(error instanceof FeatureFlagApiError);
      assert.equal(error.status, 401);
      assert.equal(error.code, "INVALID_API_KEY");
      assert.equal(error.message, "A valid evaluation API key is required.");
      return true;
    },
  );
});

test("throws a typed API error when batch evaluation fails", async () => {
  const client = new FeatureFlagClient({
    apiKey: "sdk_test_key",
    baseUrl: "http://localhost:4000",
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: "PROJECTION_NOT_READY",
          message: "No Redis projection exists for this API key environment.",
        }),
        {
          headers: {
            "content-type": "application/json",
          },
          status: 503,
        },
      ),
  });

  await assert.rejects(
    async () => await client.evaluateMany(["new_checkout"]),
    (error: unknown) => {
      assert.ok(error instanceof FeatureFlagApiError);
      assert.equal(error.status, 503);
      assert.equal(error.code, "PROJECTION_NOT_READY");
      assert.equal(error.message, "No Redis projection exists for this API key environment.");
      return true;
    },
  );
});

test("rejects missing constructor and method inputs before sending a request", async () => {
  assert.throws(
    () =>
      new FeatureFlagClient({
        apiKey: "sdk_test_key",
        baseUrl: "   ",
      }),
    /baseUrl is required/,
  );

  assert.throws(
    () =>
      new FeatureFlagClient({
        apiKey: "   ",
        baseUrl: "http://localhost:4000",
      }),
    /apiKey is required/,
  );

  const client = new FeatureFlagClient({
    apiKey: "sdk_test_key",
    baseUrl: "http://localhost:4000",
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });

  await assert.rejects(async () => await client.evaluate("   "), /flagKey is required/);
  await assert.rejects(async () => await client.evaluateMany([]), /at least one flag key/);
  await assert.rejects(
    async () => await client.evaluateMany(["new_checkout", "   "]),
    /must not contain empty flag keys/,
  );
});
