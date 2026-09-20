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

export async function ensureAuth(): Promise<MeResponse> {
  if (fixturesEnabled()) {
    return api<MeResponse>("/api/me");
  }
  try {
    return await api<MeResponse>("/api/me");
  } catch {
    await api("/api/auth/anonymous", { method: "POST" });
    return api<MeResponse>("/api/me");
  }
}
