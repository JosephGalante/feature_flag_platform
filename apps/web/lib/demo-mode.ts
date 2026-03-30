function isEnabledValue(value: string | undefined): boolean {
  return value === "1" || value === "true";
}

export function isReadOnlyDemoEnabled(): boolean {
  return isEnabledValue(process.env.READ_ONLY_DEMO_MODE);
}

export function readDemoAdminEmail(): string {
  return process.env.DEMO_ADMIN_EMAIL ?? "owner@acme.test";
}

export function buildAuthEntryHref(input?: {error?: string}): string {
  if (input?.error) {
    return `/login?error=${input.error}`;
  }

  return isReadOnlyDemoEnabled() ? "/demo" : "/login";
}
