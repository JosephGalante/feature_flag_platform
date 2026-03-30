import type {EvaluationBatchResult, EvaluationResult} from "@feature-flag-platform/evaluation-core";

export type EvaluationContextInput = Record<string, string>;

export type FeatureFlagClientOptions = {
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

export class FeatureFlagApiError extends Error {
  readonly code: string | undefined;
  readonly details: unknown;
  readonly status: number;

  constructor(input: {
    code: string | undefined;
    details: unknown;
    message: string;
    status: number;
  }) {
    super(input.message);
    this.name = "FeatureFlagApiError";
    this.code = input.code;
    this.details = input.details;
    this.status = input.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmedBaseUrl = baseUrl.trim();

  if (trimmedBaseUrl.length === 0) {
    throw new Error("FeatureFlagClient baseUrl is required.");
  }

  return trimmedBaseUrl.replace(/\/+$/, "");
}

function readApiError(responseStatus: number, payload: unknown): FeatureFlagApiError {
  const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : undefined;
  const message =
    isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : `Feature flag evaluation failed with status ${responseStatus}.`;

  return new FeatureFlagApiError({
    code,
    details: payload,
    message,
    status: responseStatus,
  });
}

export class FeatureFlagClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FeatureFlagClientOptions) {
    const apiKey = options.apiKey.trim();

    if (apiKey.length === 0) {
      throw new Error("FeatureFlagClient apiKey is required.");
    }

    this.apiKey = apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async evaluate(flagKey: string, context: EvaluationContextInput = {}): Promise<EvaluationResult> {
    const trimmedFlagKey = flagKey.trim();

    if (trimmedFlagKey.length === 0) {
      throw new Error("FeatureFlagClient flagKey is required.");
    }

    return (await this.post("/api/evaluate", {
      context,
      flagKey: trimmedFlagKey,
    })) as EvaluationResult;
  }

  async evaluateMany(
    flagKeys: ReadonlyArray<string>,
    context: EvaluationContextInput = {},
  ): Promise<EvaluationBatchResult> {
    if (flagKeys.length === 0) {
      throw new Error("FeatureFlagClient flagKeys must contain at least one flag key.");
    }

    const trimmedFlagKeys = flagKeys.map((flagKey) => {
      const trimmedFlagKey = flagKey.trim();

      if (trimmedFlagKey.length === 0) {
        throw new Error("FeatureFlagClient flagKeys must not contain empty flag keys.");
      }

      return trimmedFlagKey;
    });

    return (await this.post("/api/evaluate/batch", {
      context,
      flagKeys: trimmedFlagKeys,
    })) as EvaluationBatchResult;
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      method: "POST",
    });
    const payload = await response.json();

    if (!response.ok) {
      throw readApiError(response.status, payload);
    }

    return payload;
  }
}

export type {EvaluationBatchResult, EvaluationResult} from "@feature-flag-platform/evaluation-core";
