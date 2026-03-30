import assert from "node:assert/strict";
import test from "node:test";
import {generateApiKey, parseApiKey, readRawApiKeyFromHeaders} from "./api-keys";

test("parses a generated API key into the stored lookup fields", () => {
  const generated = generateApiKey();
  const parsed = parseApiKey(generated.rawKey);

  assert.deepEqual(parsed, {
    keyHash: generated.keyHash,
    keyPrefix: generated.keyPrefix,
    rawKey: generated.rawKey,
  });
});

test("rejects malformed API keys", () => {
  assert.equal(parseApiKey(""), null);
  assert.equal(parseApiKey("ffpk_missing_separator"), null);
  assert.equal(parseApiKey(".secret-only"), null);
  assert.equal(parseApiKey("ffpk_123456."), null);
});

test("reads API keys from x-api-key first", () => {
  assert.equal(
    readRawApiKeyFromHeaders({
      "x-api-key": "ffpk_abcdef.secret",
    }),
    "ffpk_abcdef.secret",
  );
});

test("reads API keys from bearer authorization when x-api-key is absent", () => {
  assert.equal(
    readRawApiKeyFromHeaders({
      authorization: "Bearer ffpk_abcdef.secret",
    }),
    "ffpk_abcdef.secret",
  );
});

test("returns null for unsupported authorization formats", () => {
  assert.equal(
    readRawApiKeyFromHeaders({
      authorization: "Basic abc123",
    }),
    null,
  );
  assert.equal(
    readRawApiKeyFromHeaders({
      authorization: "Bearer",
    }),
    null,
  );
});
