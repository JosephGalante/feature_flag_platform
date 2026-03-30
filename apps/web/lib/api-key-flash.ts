export const API_KEY_FLASH_COOKIE_NAME = "ff_api_key_flash";

type ApiKeyFlash = {
  keyPrefix: string;
  name: string;
  rawKey: string;
};

export function encodeApiKeyFlash(value: ApiKeyFlash): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeApiKeyFlash(value: string | undefined): ApiKeyFlash | null {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );

    if (
      typeof parsedValue.keyPrefix !== "string" ||
      typeof parsedValue.name !== "string" ||
      typeof parsedValue.rawKey !== "string"
    ) {
      return null;
    }

    return {
      keyPrefix: parsedValue.keyPrefix,
      name: parsedValue.name,
      rawKey: parsedValue.rawKey,
    };
  } catch {
    return null;
  }
}
