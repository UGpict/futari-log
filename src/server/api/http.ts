import { NextResponse } from "next/server";
import { verifyToken } from "@/server/auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.split(";").map((s) => s.trim()).find((s) => s.startsWith("futari_token="));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

export function requireUid(request: Request): { uid: string } | { error: NextResponse } {
  const uid = verifyToken(bearer(request));
  if (!uid) return { error: json({ error: "unauthorized" }, 401) };
  return { uid };
}

export function idempotencyKey(request: Request): string | null {
  return request.headers.get("idempotency-key");
}
