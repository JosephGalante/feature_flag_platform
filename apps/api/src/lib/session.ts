import {createHmac, timingSafeEqual} from "node:crypto";

type SessionPayload = {
  userId: string;
};

function signValue(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .map((segment) => {
        const separatorIndex = segment.indexOf("=");

        if (separatorIndex === -1) {
          return [segment, ""];
        }

        return [
          segment.slice(0, separatorIndex),
          decodeURIComponent(segment.slice(separatorIndex + 1)),
        ];
      }),
  );
}

function serializeCookie(
  name: string,
  value: string,
  options: {httpOnly?: boolean; maxAge?: number; path?: string; sameSite?: "Lax"; secure?: boolean},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  parts.push(`Path=${options.path ?? "/"}`);
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);

  if (options.httpOnly ?? true) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function createSessionCookie(
  cookieName: string,
  userId: string,
  secret: string,
  secure = false,
): string {
  const payload = Buffer.from(JSON.stringify({userId} satisfies SessionPayload)).toString(
    "base64url",
  );
  const signature = signValue(payload, secret);

  return serializeCookie(cookieName, `${payload}.${signature}`, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure,
  });
}

export function clearSessionCookie(cookieName: string, secure = false): string {
  return serializeCookie(cookieName, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure,
  });
}

export function readSessionUserId(
  cookieHeader: string | undefined,
  cookieName: string,
  secret: string,
): string | null {
  const cookies = parseCookies(cookieHeader);
  const rawCookie = cookies[cookieName];

  if (!rawCookie) {
    return null;
  }

  const [payload, signature] = rawCookie.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = signValue(payload, secret);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    return typeof decoded.userId === "string" && decoded.userId.length > 0 ? decoded.userId : null;
  } catch {
    return null;
  }
}
