type EnvInput = Record<string, string | undefined>;

export function readOptionalEnv(name: string, input: EnvInput = process.env): string | undefined {
  return input[name];
}

export function readRequiredEnv(name: string, input: EnvInput = process.env): string {
  const value = input[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
