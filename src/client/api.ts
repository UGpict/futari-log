import { fixtureResponse, fixturesEnabled } from "@/fixtures";
import type { MeResponse } from "@/contracts";

export { fixturesEnabled };

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (fixturesEnabled()) {
    return fixtureResponse<T>(path, init);
  }
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Establish a session cookie for API calls.
 *
 * 1. Firebase client user present → exchange idToken via /api/auth/session
 * 2. Else valid existing Cookie → keep using it (legacy cookie-only anonymous; no migration)
 * 3. Else signInAnonymously → exchange idToken
 *
 * POST /api/auth/anonymous remains for scripts; the browser path prefers the client SDK.
 */
export async function ensureAuth(): Promise<MeResponse> {
  if (fixturesEnabled()) {
    return api<MeResponse>("/api/me");
  }

  const { refreshSessionFromCurrentUser, startAnonymousFirebaseSession } = await import("./auth");
  const refreshed = await refreshSessionFromCurrentUser();
  if (refreshed) {
    return api<MeResponse>("/api/me");
  }

  try {
    return await api<MeResponse>("/api/me");
  } catch {
    await startAnonymousFirebaseSession();
    return api<MeResponse>("/api/me");
  }
}
