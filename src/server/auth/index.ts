import { getEnv } from "@/config/env";
import { hmacSha256, newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import { withStore } from "@/server/repositories/store";

const COOKIE = "futari_token";

export function tokenCookieName() {
  return COOKIE;
}

export function createUid(): string {
  return newId("anon");
}

export function signToken(uid: string): string {
  const env = getEnv();
  const payload = `${uid}.${Date.now()}`;
  return `mock.${payload}.${hmacSha256(env.mockAuthSecret, payload)}`;
}

export function verifyToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const env = getEnv();
  const parts = token.split(".");
  if (parts.length < 4 || parts[0] !== "mock") return null;
  const uid = parts[1];
  const ts = parts[2];
  const sig = parts.slice(3).join(".");
  const payload = `${uid}.${ts}`;
  if (hmacSha256(env.mockAuthSecret, payload) !== sig) return null;
  return uid;
}

export async function issueAnonymous(): Promise<{ uid: string; token: string }> {
  const uid = createUid();
  const token = signToken(uid);
  await withStore((db) => {
    db.tokens[token] = { uid, createdAt: realNowIso() };
  });
  return { uid, token };
}

export function demoAllowed(uid: string): boolean {
  const env = getEnv();
  if (!env.enableDemoControls) return false;
  if (env.runtime === "MOCK") return true;
  return env.demoAllowedUids.includes(uid);
}
