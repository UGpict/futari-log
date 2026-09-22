/**
 * LIVE smoke: force WAITING_INPUT then answer change_conditions → SUPERSEDED.
 *   DEMO_BASE_URL=... npx tsx scripts/live-smoke-change-conditions.ts
 */
import { tokyoToday } from "../src/config/public";

const BASE = process.env.DEMO_BASE_URL ?? "https://futari-log-w5a2hgpkiq-an.a.run.app";

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function waitRun(token: string, runId: string) {
  const start = Date.now();
  for (;;) {
    const view = await api(`/api/runs/${runId}`, { token });
    const status = view.run.status as string;
    if (
      [
        "SUCCEEDED",
        "WAITING_INPUT",
        "WAITING_APPROVAL",
        "FAILED",
        "PARTIAL",
        "INTERRUPTED",
        "CANCELLED",
        "SUPERSEDED",
      ].includes(status)
    ) {
      return view;
    }
    if (Date.now() - start > 180_000) throw new Error(`timeout ${runId} ${status}`);
    await new Promise((r) => setTimeout(r, 800));
  }
}

async function main() {
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

  // Impossible MUST wish → q_unsupported_wish or q_no_candidates / q_plan_unmet
  const session = await api(`/api/couples/${couple.id}/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify({
      dateTokyo: tokyoToday(),
      startTime: "13:00",
      endTime: "14:00",
      meet: {
        name: "東京駅",
        lat: 35.681236,
        lng: 139.767125,
        spotId: "ChIJC3Cf2PuLGGARAGOBuk2RkDI",
      },
      end: {
        name: "東京駅",
        lat: 35.681236,
        lng: 139.767125,
        spotId: "ChIJC3Cf2PuLGGARAGOBuk2RkDI",
      },
      budget: { mealsJpy: 1000, facilitiesJpy: 500, transitJpy: 0 },
      preferences: [
        {
          id: "pref_impossible",
          subject: "SELF",
          content: "火星で宇宙旅行したい",
          priority: "MUST",
          source: "SELF_REPORT",
        },
      ],
      fixedAppointments: [],
      autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
      travelMode: "WALK",
      areaName: "東京駅",
      areaLat: 35.681236,
      areaLng: 139.767125,
      radiusMeters: 800,
    }),
  });

  const started = await api(`/api/sessions/${session.sessionId}/runs`, {
    method: "POST",
    token,
    body: JSON.stringify({ kind: "INITIAL_PLAN" }),
  });
  const first = await waitRun(token, started.runId);
  console.log(
    JSON.stringify(
      {
        runId: started.runId,
        status: first.run.status,
        questionId: first.run.waitingQuestion?.id ?? null,
        options: first.run.waitingQuestion?.options ?? null,
      },
      null,
      2,
    ),
  );

  if (first.run.status !== "WAITING_INPUT" || !first.run.waitingQuestion) {
    throw new Error(`expected WAITING_INPUT, got ${first.run.status}`);
  }

  const options = first.run.waitingQuestion.options as Array<string | { id: string; label: string }>;
  const change =
    options.find((o) => typeof o !== "string" && o.id === "change_conditions") ??
    options.find((o) => (typeof o === "string" ? /条件|場所/.test(o) : /条件|場所/.test(o.label)));
  if (!change) throw new Error(`no change_conditions option in ${JSON.stringify(options)}`);

  const answerId = typeof change === "string" ? undefined : change.id;
  const answer = typeof change === "string" ? change : change.label;
  const answered = await api(`/api/runs/${started.runId}/answers`, {
    method: "POST",
    token,
    body: JSON.stringify({
      questionId: first.run.waitingQuestion.id,
      answer,
      ...(answerId ? { answerId } : {}),
    }),
  });
  const after = await api(`/api/runs/${started.runId}`, { token });
  const result = {
    answerResponse: answered,
    status: after.run.status,
    cancelReason: after.run.cancelReason ?? null,
    error: after.run.error,
    ok:
      answered.next === "edit_conditions" &&
      after.run.status === "SUPERSEDED" &&
      after.run.error == null,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
