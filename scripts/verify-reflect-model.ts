/**
 * Save one reflection on LIVE and print MODEL_SELECTED actualModel.
 * Usage: DEMO_BASE_URL=https://… npx tsx scripts/verify-reflect-model.ts
 */
process.env.ENABLE_DEMO_CONTROLS ??= "true";

import { tokyoToday } from "../src/config/public";

const BASE = process.env.DEMO_BASE_URL ?? "https://futari-log-w5a2hgpkiq-an.a.run.app";

const ALLOWED_UNDERLYING = new Set(
  (process.env.ORCA_ALLOWED_ACTUAL_MODELS ?? "gemini-2.5-flash,gpt-4o-2024-08-06,gpt-4o,google/gemini-2.5-flash")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

async function api(path: string, opts: { method?: string; token?: string; body?: string; headers?: Record<string, string> } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Cookie: `futari_token=${encodeURIComponent(opts.token)}` } : {}),
      ...opts.headers,
    },
    body: opts.body,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status} ${text.slice(0, 400)}`);
  }
  return json as Record<string, unknown>;
}

async function waitRun(token: string, runId: string, timeoutMs = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const view = await api(`/api/runs/${runId}`, { token });
    const run = view.run as { status: string; cost?: unknown };
    const events = (view.events as Array<Record<string, unknown>>) ?? [];
    if (["SUCCEEDED", "FAILED", "CANCELLED", "WAITING_INPUT", "WAITING_APPROVAL"].includes(run.status)) {
      return { ms: Date.now() - started, run, events };
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`timeout waiting for ${runId}`);
}

async function main() {
  const health = await api("/api/health");
  console.log("health", health);

  const auth = await fetch(`${BASE}/api/auth/anonymous`, { method: "POST" });
  const setCookie = auth.headers.get("set-cookie") ?? "";
  const tokenRaw = setCookie.match(/futari_token=([^;]+)/)?.[1];
  const token = tokenRaw ? decodeURIComponent(tokenRaw) : undefined;
  if (!token) throw new Error("no token");

  const couple = await api("/api/couples", {
    method: "POST",
    token,
    body: JSON.stringify({ isDemo: true }),
  });
  const date = tokyoToday();
  const session = await api(`/api/couples/${couple.id}/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify({
      dateTokyo: date,
      startTime: "13:00",
      endTime: "18:00",
      meet: {
        name: "東京駅",
        lat: 35.681236,
        lng: 139.767125,
        spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs",
      },
      end: {
        name: "東京駅",
        lat: 35.681236,
        lng: 139.767125,
        spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs",
      },
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
      preferences: [
        { id: "pref_self", subject: "SELF", content: "散歩", priority: "PREFER", source: "SELF_REPORT" },
      ],
      fixedAppointments: [],
      autoApply: {
        enabled: true,
        acknowledgedScope: "未着手1件 PASS 予算増なし 終了遅延なし 移動増なし",
        validUntil: "2099-01-01T00:00:00.000Z",
      },
      travelMode: "WALK",
      areaName: "東京駅周辺",
      areaLat: 35.681236,
      areaLng: 139.767125,
      radiusMeters: 2500,
    }),
  });

  const sessionId = session.sessionId as string;
  console.log("session", sessionId);

  const saved = await api(`/api/sessions/${sessionId}/reflections`, {
    method: "POST",
    token,
    body: JSON.stringify({
      title: "モデル確認",
      note: "展示の途中で少し疲れていた。次は座って休める時間を入れたい。",
      mood: "tired",
      planVersion: null,
      visits: [],
    }),
  });

  const reflection = saved.reflection as { id: string; analysisRunId: string | null; analysisStatus: string };
  console.log("reflection", {
    id: reflection.id,
    analysisRunId: reflection.analysisRunId,
    analysisStatus: reflection.analysisStatus,
    analysisEnqueued: saved.analysisEnqueued,
  });

  const runId = reflection.analysisRunId;
  if (!runId) throw new Error("no analysisRunId after save");

  const finished = await waitRun(token, runId);
  const modelEvents = finished.events.filter((e) => e.type === "MODEL_SELECTED");
  console.log(
    JSON.stringify(
      {
        runId,
        status: finished.run.status,
        waitMs: finished.ms,
        cost: finished.run.cost,
        modelEvents: modelEvents.map((e) => ({
          pool: e.pool,
          requestedModel: e.requestedModel,
          actualModel: e.actualModel,
          summary: e.summary,
          usage: e.usage,
        })),
      },
      null,
      2,
    ),
  );

  const actuals = modelEvents.map((e) => String(e.actualModel ?? ""));
  const requested = modelEvents.map((e) => String(e.requestedModel ?? ""));
  const okRequested = requested.every((m) => m === "orcarouter/futari-hard");
  const okActual =
    actuals.length > 0 &&
    actuals.every(
      (m) =>
        ALLOWED_UNDERLYING.has(m) ||
        [...ALLOWED_UNDERLYING].some((a) => m.includes(a) || a.includes(m)),
    );
  const okPool = modelEvents.every((e) => e.pool === "hard");

  console.log(
    JSON.stringify(
      {
        verdict: {
          okRequested,
          okActual,
          okPool,
          requested,
          actuals,
          allowedUnderlying: [...ALLOWED_UNDERLYING],
        },
      },
      null,
      2,
    ),
  );

  if (!okRequested || !okActual || !okPool) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
