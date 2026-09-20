import { getEnv } from "@/config/env";
import { hmacSha256, newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import { adminAuth } from "@/server/firebase/admin";
import { withStore } from "@/server/repositories/store";

const COOKIE = "futari_token";
const SESSION_MS = 60 * 60 * 24 * 14 * 1000;

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

export function verifyMockToken(token: string | null | undefined): string | null {
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

async function signUpAnonymous(): Promise<{ uid: string; idToken: string }> {
  const env = getEnv();
  const apiKey = env.firebaseApiKey ?? "fake-api-key-for-emulator";
  const url = env.authEmulatorHost
    ? `http://${env.authEmulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`
    : `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    localId?: string;
    idToken?: string;
    error?: { message?: string };
  };
  if (!res.ok || !body.localId || !body.idToken) {
    throw new Error(body.error?.message ?? `anonymous signup HTTP ${res.status}`);
  }
  return { uid: body.localId, idToken: body.idToken };
}

export async function verifyToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  if (token.startsWith("mock.")) return verifyMockToken(token);
  const env = getEnv();
  if (env.authBackend !== "firebase") return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    return decoded.uid;
  } catch {
    try {
      const decoded = await adminAuth().verifyIdToken(token, true);
      return decoded.uid;
    } catch {
      return null;
    }
  }
}

export async function issueAnonymous(): Promise<{ uid: string; token: string }> {
  const env = getEnv();
  if (env.authBackend === "firebase") {
    const { uid, idToken } = await signUpAnonymous();
    try {
      const token = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MS });
      return { uid, token };
    } catch {
      return { uid, token: idToken };
    }
  }

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
