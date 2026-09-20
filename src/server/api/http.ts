import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { verifyToken } from "@/server/auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
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
