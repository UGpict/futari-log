import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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

function identityToolkitUrl(path: string): string {
  const env = getEnv();
  const apiKey = env.firebaseApiKey ?? "fake-api-key-for-emulator";
  const suffix = `identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`;
  return env.authEmulatorHost ? `http://${env.authEmulatorHost}/${suffix}` : `https://${suffix}`;
}

function hasAdminCredentials(): boolean {
  const env = getEnv();
  if (env.emulator || env.onCloudRun) return true;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) return true;
  return existsSync(join(homedir(), ".config/gcloud/application_default_credentials.json"));
}

async function signUpAnonymous(): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(identityToolkitUrl("accounts:signUp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
    signal: AbortSignal.timeout(15000),
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

async function lookupUidByIdToken(idToken: string): Promise<string | null> {
  try {
    const res = await fetch(identityToolkitUrl("accounts:lookup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      users?: { localId?: string }[];
    };
    return body.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

export async function verifyToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  if (token.startsWith("mock.")) return verifyMockToken(token);
  const env = getEnv();
  if (env.authBackend !== "firebase") return null;

  const lookedUp = await lookupUidByIdToken(token);
  if (lookedUp) return lookedUp;
  if (!hasAdminCredentials()) return null;

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
    if (!hasAdminCredentials()) return { uid, token: idToken };
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
