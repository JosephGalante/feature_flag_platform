import {createHash, randomBytes} from "node:crypto";

const API_KEY_PREFIX_LABEL = "ffpk";
const API_KEY_PREFIX_BYTES = 6;
const API_KEY_SECRET_BYTES = 24;
const API_KEY_SEPARATOR = ".";

export type GeneratedApiKey = {
  keyHash: string;
  keyPrefix: string;
  rawKey: string;
};

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

export function parseApiKeyPrefix(rawKey: string): string | null {
  const separatorIndex = rawKey.indexOf(API_KEY_SEPARATOR);

  if (separatorIndex <= 0) {
    return null;
  }

  return rawKey.slice(0, separatorIndex);
}

export function generateApiKey(): GeneratedApiKey {
  const keyPrefix = `${API_KEY_PREFIX_LABEL}_${randomBytes(API_KEY_PREFIX_BYTES).toString("hex")}`;
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString("base64url");
  const rawKey = `${keyPrefix}${API_KEY_SEPARATOR}${secret}`;

  return {
    keyHash: hashApiKey(rawKey),
    keyPrefix,
    rawKey,
  };
}
