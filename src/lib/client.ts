export async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function ensureAuth(): Promise<{
  uid: string;
  coupleId: string | null;
  runtime: string;
  demoAreaName: string;
  demoDate: string;
  demoLat: number;
  demoLng: number;
  blockers: { code: string; item: string }[];
}> {
  try {
    return await api("/api/me");
  } catch {
    await api("/api/auth/anonymous", { method: "POST" });
    return api("/api/me");
  }
}
