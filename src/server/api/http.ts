import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import type { RateLimitBucket } from "@/config/settings";
import { verifyToken } from "@/server/auth";
import { isOpsGuardError, type OpsGuardError } from "@/server/ops/errors";
import { consumeRateLimit } from "@/server/ops/rateLimit";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function opsErrorResponse(error: OpsGuardError) {
  return json({ error: error.message, code: error.code }, error.status);
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("futari_token="));
  return match ? decodeURIComponent(match.split("=").slice(1).join("=") ?? "") : null;
}

export async function requireUid(
  request: Request,
): Promise<{ uid: string } | { error: NextResponse }> {
  const uid = await verifyToken(bearer(request));
  if (!uid) return { error: json({ error: "unauthorized" }, 401) };
  return { uid };
}

/** Client IP for rate limiting when uid is absent. Prefer first X-Forwarded-For hop. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
}

/**
 * uid-preferred rate limit. Over limit → 429 RATE_LIMITED (not silent MOCK).
 */
export async function enforceRateLimit(
  request: Request,
  uid: string | null | undefined,
  bucket: RateLimitBucket,
): Promise<{ ok: true } | { error: NextResponse }> {
  const result = await consumeRateLimit({
    bucket,
    uid,
    ip: clientIp(request),
  });
  if (!result.ok) return { error: opsErrorResponse(result.error) };
  return { ok: true };
}

export function catchOpsGuard(error: unknown): NextResponse | null {
  if (isOpsGuardError(error)) return opsErrorResponse(error);
  return null;
}

export function idempotencyKey(request: Request): string | null {
  return request.headers.get("idempotency-key");
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: json({ error: issue?.message ?? "invalid" }, 400) };
  }
  return { data: parsed.data };
}
