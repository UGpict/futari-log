import { runWithBreaker } from "@/server/ops/breaker";

/** Max wait for 429 Retry-After before skipping retry (ms). */
export const ORCA_RETRY_AFTER_MAX_MS = 8_000;

const GATEWAY_RETRY_DELAY_MS = 500;

export function parseRetryAfterMs(header: string | null, nowMs = Date.now()): number | null {
  if (!header?.trim()) return null;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - nowMs);
  }
  return null;
}

export function retryDelayMsForStatus(status: number, retryAfterHeader: string | null): number | null {
  if (status === 429) {
    const delay = parseRetryAfterMs(retryAfterHeader);
    if (delay == null || delay > ORCA_RETRY_AFTER_MAX_MS) return null;
    return delay;
  }
  if (status === 502 || status === 503 || status === 504) {
    return GATEWAY_RETRY_DELAY_MS;
  }
  return null;
}

function sleepMs(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type OrcaFetchWithRetryResult = {
  response: Response;
  retries: number;
  lastStatus: number | null;
};

/**
 * One automatic retry for transient OrcaRouter failures.
 * Honors the caller AbortSignal (typically withTimeout) for the whole operation including backoff.
 * Phase 2b: process-local circuit breaker — OPEN fails fast with CIRCUIT_OPEN (no silent MOCK).
 */
export async function fetchOrcaWithRetry(
  url: RequestInfo | URL,
  init: RequestInit,
): Promise<OrcaFetchWithRetryResult> {
  return runWithBreaker(
    "orcarouter",
    async () => {
      const signal = init.signal ?? undefined;
      let retries = 0;
      let response = await fetch(url, init);
      let lastStatus: number | null = response.status;

      if (
        !response.ok &&
        retries < 1 &&
        response.status !== 400 &&
        response.status !== 401 &&
        response.status !== 403
      ) {
        const delay = retryDelayMsForStatus(response.status, response.headers.get("Retry-After"));
        if (delay != null) {
          await sleepMs(delay, signal);
          retries = 1;
          response = await fetch(url, init);
          lastStatus = response.status;
        }
      }

      return { response, retries, lastStatus };
    },
    {
      classify: (result) => {
        // Auth / client errors are not provider outages.
        const status = result.response.status;
        if (result.response.ok) return "success";
        if (status === 400 || status === 401 || status === 403) return "ignore";
        return "failure";
      },
    },
  );
}
