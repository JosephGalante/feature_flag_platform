import {createHash, randomBytes} from "node:crypto";

const API_KEY_PREFIX_LABEL = "ffpk";
const API_KEY_PREFIX_BYTES = 6;
const API_KEY_SECRET_BYTES = 24;
const API_KEY_SEPARATOR = ".";

type ApiKeyHeaders = {
  authorization?: string | string[] | undefined;
  "x-api-key"?: string | string[] | undefined;
};

type GeneratedApiKey = {
  keyHash: string;
  keyPrefix: string;
  rawKey: string;
};

type ParsedApiKey = {
  keyHash: string;
  keyPrefix: string;
  rawKey: string;
};

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}

function readSingleHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = item.trim();

      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
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

export function parseApiKey(rawKey: string): ParsedApiKey | null {
  const separatorIndex = rawKey.indexOf(API_KEY_SEPARATOR);

  if (
    separatorIndex <= 0 ||
    !rawKey.startsWith(`${API_KEY_PREFIX_LABEL}_`) ||
    separatorIndex === rawKey.length - 1
  ) {
    return null;
  }

  const keyPrefix = rawKey.slice(0, separatorIndex);

  return {
    keyHash: hashApiKey(rawKey),
    keyPrefix,
    rawKey,
  };
}

export function readRawApiKeyFromHeaders(headers: ApiKeyHeaders): string | null {
  const directApiKey = readSingleHeaderValue(headers["x-api-key"]);

  if (directApiKey) {
    return directApiKey;
  }

  const authorizationHeader = readSingleHeaderValue(headers.authorization);

  if (!authorizationHeader) {
    return null;
  }

  const [scheme, credentials, ...rest] = authorizationHeader.split(/\s+/);

  if (!scheme || !credentials || rest.length > 0 || !/^Bearer$/i.test(scheme)) {
    return null;
  }

  return credentials;
}
