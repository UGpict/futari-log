/** Explicit ops-guard failures — never silent MOCK fallback. */

export type OpsErrorCode = "RATE_LIMITED" | "API_BUDGET_EXCEEDED";

export class OpsGuardError extends Error {
  readonly code: OpsErrorCode;
  readonly status: 429 | 503;
  readonly detail: string;

  constructor(input: { code: OpsErrorCode; status: 429 | 503; message: string; detail?: string }) {
    super(input.message);
    this.name = "OpsGuardError";
    this.code = input.code;
    this.status = input.status;
    this.detail = input.detail ?? input.message;
  }
}

export function isOpsGuardError(error: unknown): error is OpsGuardError {
  return error instanceof OpsGuardError;
}

export function rateLimitedError(bucket: string): OpsGuardError {
  return new OpsGuardError({
    code: "RATE_LIMITED",
    status: 429,
    message: `rate limit exceeded: ${bucket}`,
    detail: bucket,
  });
}

export function budgetExceededError(kind: string): OpsGuardError {
  return new OpsGuardError({
    code: "API_BUDGET_EXCEEDED",
    status: 503,
    message: `API budget exceeded: ${kind}`,
    detail: kind,
  });
}
