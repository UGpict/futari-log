process.env.APP_RUNTIME ??= "MOCK";
process.env.ENABLE_DEMO_CONTROLS ??= "true";
process.env.DEMO_DATE ??= "2026-09-19";

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const BASE = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";
const five = process.argv.includes("--five");

type Report = {
  ok: boolean;
  git?: string;
  runIds: string[];
  durationsMs: number[];
  costs: unknown[];
  notes: string[];
  failures: string[];
};

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server not ready");
}

function ensureServer(): ChildProcess | null {
  return fetch(BASE)
    .then(() => null)
    .catch(() => {
      return spawn("npx", ["tsx", "scripts/dev.ts"], {
        stdio: "inherit",
        env: process.env,
        shell: process.platform === "win32",
      });
    }) as unknown as ChildProcess | null;
}

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
    if (["SUCCEEDED", "WAITING_INPUT", "WAITING_APPROVAL", "FAILED", "PARTIAL", "INTERRUPTED"].includes(status)) {
      return { view, ms: Date.now() - start };
    }
    if (Date.now() - start > 25000) throw new Error(`timeout ${runId} ${status}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function onePass(): Promise<Report> {
  const notes: string[] = [];
  const failures: string[] = [];
  const runIds: string[] = [];
  const durationsMs: number[] = [];
  const costs: unknown[] = [];
  const git = existsSync(".git")
    ? execSync("git rev-parse --short HEAD").toString().trim()
    : undefined;

  const auth = await fetch(`${BASE}/api/auth/anonymous`, { method: "POST" });
  const setCookie = auth.headers.get("set-cookie") ?? "";
  const tokenRaw = setCookie.match(/futari_token=([^;]+)/)?.[1];
  const token = tokenRaw ? decodeURIComponent(tokenRaw) : undefined;
  if (!token) throw new Error("no token");
  const me = await api("/api/me", { token });
  const couple = await api("/api/couples", {
    method: "POST",
    token,
    body: JSON.stringify({ isDemo: true }),
  });
  const date = process.env.DEMO_DATE ?? "2026-09-19";
  const session = await api(`/api/couples/${couple.id}/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify({
      dateTokyo: date,
      startTime: "13:00",
      endTime: "18:00",
      meet: { name: "名古屋駅", lat: 35.170915, lng: 136.881537, spotId: "mock:nagoya-station" },
      end: { name: "名古屋駅", lat: 35.170915, lng: 136.881537, spotId: "mock:nagoya-station" },
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
      preferences: [
        { id: "pref_self", subject: "SELF", content: "散歩と展示", priority: "PREFER", source: "SELF_REPORT" },
        { id: "pref_partner", subject: "PARTNER", content: "甘いもの", priority: "MUST", source: "PARTNER_STATEMENT_REPORTED" },
      ],
      fixedAppointments: [
        {
          id: "fix_art",
          label: "愛知県美術館",
          spotId: "mock:aichi-art-museum",
          spotNameHint: "愛知県美術館",
          startAt: `${date}T15:00:00+09:00`,
          endAt: `${date}T16:00:00+09:00`,
          kind: "TIME_FIXED",
        },
      ],
      autoApply: {
        enabled: true,
        acknowledgedScope: "未着手1件 PASS 予算増なし 終了遅延なし 移動増なし",
        validUntil: "2099-01-01T00:00:00.000Z",
      },
      travelMode: "WALK",
      areaName: "名古屋駅周辺",
      areaLat: 35.170915,
      areaLng: 136.881537,
      radiusMeters: 2500,
    }),
  });

  const init = await api(`/api/sessions/${session.sessionId}/runs`, {
    method: "POST",
    token,
    headers: { "Idempotency-Key": `live-${session.sessionId}` },
    body: JSON.stringify({ kind: "INITIAL_PLAN" }),
  });
  const first = await waitRun(token, init.runId);
  runIds.push(init.runId);
  durationsMs.push(first.ms);
  costs.push(first.view.run.cost);

  const snap1 = await api(`/api/sessions/${session.sessionId}`, { token });
  const items = snap1.plan?.items ?? [];
  if (items.length < 3 || items.length > 4) failures.push(`spot count ${items.length}`);
  const locked = items.find((i: { locked: boolean }) => i.locked);
  if (!locked) failures.push("locked item missing");
  if (snap1.plan?.openings?.some((o: { state: string }) => o.state === "CLOSED")) {
    failures.push("CLOSED present");
  }
  notes.push(`first status=${first.view.run.status} validation=${snap1.plan?.validation?.state} items=${items.length} runs=${(snap1.runs as {id:string;status:string;kind:string}[]).map((r)=>r.kind+":"+r.status).join(",")}`);
  if (snap1.plan?.validation?.state === "FAIL") {
    failures.push(`initial validation FAIL: ${(snap1.plan.validation.issues as {code:string}[]).map((i)=>i.code).join(",")}`);
  }

  await api(`/api/sessions/${session.sessionId}/progress`, {
    method: "POST",
    token,
    body: JSON.stringify({ confirm: true, status: "CONFIRMED" }),
  });
  const doneItem =
    items.find((i: { locked: boolean; progress: string }) => i.locked) ?? items.at(-1);
  if (doneItem) {
    await api(`/api/sessions/${session.sessionId}/progress`, {
      method: "POST",
      token,
      body: JSON.stringify({
        itemId: doneItem.id,
        progress: "DONE",
        status: "IN_PROGRESS",
        location: { lat: 35.170278, lng: 136.908611, label: "愛知県美術館" },
      }),
    });
  }

  const rain = await api(`/api/sessions/${session.sessionId}/scenarios`, {
    method: "POST",
    token,
    body: JSON.stringify({ kind: "WEATHER", overlay: { precipitationMm: 8 } }),
  });
  const rainWait = await waitRun(token, rain.runId);
  runIds.push(rain.runId);
  durationsMs.push(rainWait.ms);
  let snapRain = await api(`/api/sessions/${session.sessionId}`, { token });
  const auto = (snapRain.events as { type: string }[]).some((e) => e.type === "PLAN_AUTO_APPLIED");
  const approval = (snapRain.approvals as { status: string; id: string; kind: string }[]).find(
    (a) => a.status === "PENDING" && a.kind === "PLAN_APPLY",
  );
  notes.push(auto ? "rain AUTO_NOTIFY" : approval ? "rain APPROVAL" : `rain status=${rainWait.view.run.status}`);
  if (!auto && !approval) failures.push("rain produced neither notify nor approval");
  if (approval) {
    await api(`/api/approvals/${approval.id}/decision`, {
      method: "POST",
      token,
      body: JSON.stringify({ decision: "APPROVE" }),
    });
    snapRain = await api(`/api/sessions/${session.sessionId}`, { token });
  }

  const beforeDelayVersion = snapRain.session.currentPlanVersion;
  const delay = await api(`/api/sessions/${session.sessionId}/scenarios`, {
    method: "POST",
    token,
    body: JSON.stringify({
      kind: "TRAVEL_DELAY",
      overlay: { delayMinutes: 55 },
      spotId: "mock:aichi-art-museum",
    }),
  });
  const delayWait = await waitRun(token, delay.runId);
  runIds.push(delay.runId);
  durationsMs.push(delayWait.ms);
  const snapDelay = await api(`/api/sessions/${session.sessionId}`, { token });
  if (snapDelay.session.currentPlanVersion !== beforeDelayVersion) {
    failures.push("plan changed before delay approval");
  }
  if (delayWait.view.run.status !== "WAITING_APPROVAL") {
    notes.push(`delay status=${delayWait.view.run.status} (expected WAITING_APPROVAL)`);
    if (delayWait.view.run.status === "SUCCEEDED") failures.push("delay auto-applied");
  }

  const refl = await api(`/api/sessions/${session.sessionId}/runs`, {
    method: "POST",
    token,
    body: JSON.stringify({ kind: "REFLECTION" }),
  });
  const reflWait = await waitRun(token, refl.runId);
  runIds.push(refl.runId);
  if (reflWait.view.run.status !== "WAITING_INPUT") failures.push("no confirmation question");
  const q = reflWait.view.run.waitingQuestion;
  await api(`/api/runs/${refl.runId}/answers`, {
    method: "POST",
    token,
    body: JSON.stringify({
      questionId: q.id,
      answer: "長く立つのがしんどいと言っていた",
    }),
  });
  const snapMem = await api(`/api/sessions/${session.sessionId}`, { token });
  const pendingMem = (snapMem.approvals as { kind: string; status: string; id: string }[]).find(
    (a) => a.kind === "MEMORY_SAVE" && a.status === "PENDING",
  );
  if ((snapMem.memories as unknown[]).length > 0) failures.push("memory saved before approval");
  if (!pendingMem) failures.push("no memory approval");
  else {
    await api(`/api/approvals/${pendingMem.id}/decision`, {
      method: "POST",
      token,
      body: JSON.stringify({ decision: "APPROVE" }),
    });
  }
  const afterMem = await api(`/api/sessions/${session.sessionId}`, { token });
  if ((afterMem.memories as unknown[]).length < 1) failures.push("memory missing after approval");

  const next = await api(`/api/couples/${couple.id}/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify(session.input),
  });
  const nextRun = await api(`/api/sessions/${next.sessionId}/runs`, {
    method: "POST",
    token,
    body: JSON.stringify({ kind: "NEXT_PLAN" }),
  });
  const nextWait = await waitRun(token, nextRun.runId);
  runIds.push(nextRun.runId);
  durationsMs.push(nextWait.ms);
  const snapNext = await api(`/api/sessions/${next.sessionId}`, { token });
  const influences = snapNext.plan?.memoryInfluences ?? [];
  if (!influences.length) notes.push("next plan has no visible memory influence");
  else notes.push(`memory influence ${influences.map((i: { effect: string }) => i.effect).join(",")}`);

  await api(`/api/runs/${init.runId}/replay-export`, { method: "POST", token, body: "{}" });

  void me;
  return {
    ok: failures.length === 0,
    git,
    runIds,
    durationsMs,
    costs,
    notes,
    failures,
  };
}

async function main() {
  let child: ChildProcess | null = null;
  try {
    const maybe = await fetch(BASE).then(() => null).catch(() => "start");
    if (maybe === "start") {
      child = spawn("npx", ["tsx", "scripts/dev.ts"], {
        stdio: "inherit",
        env: process.env,
        shell: process.platform === "win32",
      });
    }
    await waitForServer();
    const reports: Report[] = [];
    const n = five ? 5 : 1;
    for (let i = 0; i < n; i++) {
      const report = await onePass();
      reports.push(report);
      if (!report.ok) break;
    }
    mkdirSync("docs/reports", { recursive: true });
    const out = join("docs/reports", five ? "demo-five.json" : "demo-live.json");
    writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), reports }, null, 2));
    const last = reports.at(-1);
    console.log(JSON.stringify({ file: out, ok: reports.every((r) => r.ok), count: reports.length, last }, null, 2));
    if (!reports.every((r) => r.ok) || reports.length < n) process.exit(1);
  } finally {
    child?.kill("SIGTERM");
  }
}

void ensureServer;
void main();
