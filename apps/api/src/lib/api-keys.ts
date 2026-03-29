import {createHash, randomBytes} from "node:crypto";

const API_KEY_PREFIX_LABEL = "ffpk";
const API_KEY_PREFIX_BYTES = 6;
const API_KEY_SECRET_BYTES = 24;
const API_KEY_SEPARATOR = ".";

type GeneratedApiKey = {
  keyHash: string;
  keyPrefix: string;
  rawKey: string;
};

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
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
