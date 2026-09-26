import { getEnv } from "@/config/env";
import type { RateLimitBucket } from "@/config/settings";
import { tokyoToday, toTokyoParts } from "@/lib/time";
import { tryIncrementCounter } from "./counters";
import { rateLimitedError, type OpsGuardError } from "./errors";
import { emitRateLimited } from "./metrics";

export type { RateLimitBucket };

export function rateLimitSubject(uid: string | null | undefined, ip: string): string {
  const trimmedUid = uid?.trim();
  if (trimmedUid) return `uid:${trimmedUid}`;
  const trimmedIp = ip.trim() || "unknown";
  return `ip:${trimmedIp}`;
}

/** Tokyo-local minute bucket id: YYYY-MM-DDTHH:MM */
export function tokyoMinuteBucket(now: Date = new Date()): string {
  const parts = toTokyoParts(now.toISOString());
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${parts.date}T${hh}:${mm}`;
}

export function tokyoDayBucket(now: Date = new Date()): string {
  return tokyoToday(now);
}

export function rateLimitCounterKey(
  bucket: RateLimitBucket,
  subject: string,
  window: "minute" | "day",
  now: Date = new Date(),
): string {
  const windowId = window === "minute" ? tokyoMinuteBucket(now) : tokyoDayBucket(now);
  return `rate:${bucket}:${subject}:${window}:${windowId}`;
}

/**
 * Consume one request from both per-minute and daily windows.
 * Fails closed with RATE_LIMITED (never silent).
 */
export async function consumeRateLimit(input: {
  bucket: RateLimitBucket;
  uid?: string | null;
  ip: string;
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: OpsGuardError }> {
  const limits = getEnv().rateLimits[input.bucket];
  const subject = rateLimitSubject(input.uid, input.ip);
  const now = input.now ?? new Date();

  const minuteKey = rateLimitCounterKey(input.bucket, subject, "minute", now);
  const minute = await tryIncrementCounter(minuteKey, limits.perMinute);
  if (!minute.ok) {
    emitRateLimited({ bucket: input.bucket, subject });
    return { ok: false, error: rateLimitedError(input.bucket) };
  }

  const dayKey = rateLimitCounterKey(input.bucket, subject, "day", now);
  const day = await tryIncrementCounter(dayKey, limits.perDay);
  if (!day.ok) {
    emitRateLimited({ bucket: input.bucket, subject });
    return { ok: false, error: rateLimitedError(input.bucket) };
  }

  return { ok: true };
}
