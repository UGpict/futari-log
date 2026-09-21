/**
 * LIVE one-shot E2E for agent-architecture-v2 measurements.
 * Writes only new couple/session/run docs. No deletes/updates of foreign docs.
 *
 *   DEMO_BASE_URL=https://futari-log-w5a2hgpkiq-an.a.run.app \
 *     npx tsx scripts/live-e2e-measure-architecture-v2.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { tokyoToday } from "../src/config/public";

const BASE = process.env.DEMO_BASE_URL ?? "https://futari-log-w5a2hgpkiq-an.a.run.app";
const OUT = join("docs/reports", "live-e2e-architecture-v2-raw.json");

type Stamp = { label: string; at: string; epochMs: number };
type Note = string;

function nowStamp(label: string): Stamp {
  const d = new Date();
  return { label, at: d.toISOString(), epochMs: d.getTime() };
}

async function api(path: string, init: RequestInit & { token?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${path} ${res.status} ${JSON.stringify(json)}`) as Error & {
      status?: number;
      body?: unknown;
    };
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function waitRun(
  token: string,
  runId: string,
  opts: { timeoutMs?: number; accept?: string[] } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 600_000;
  const accept = new Set(
    opts.accept ?? ["SUCCEEDED", "WAITING_INPUT", "WAITING_APPROVAL", "FAILED", "PARTIAL", "INTERRUPTED", "CANCELLED"],
  );
  const start = Date.now();
  let lastStatus = "UNKNOWN";
  for (;;) {
    const view = await api(`/api/runs/${runId}`, { token });
    lastStatus = view.run.status as string;
    if (accept.has(lastStatus)) {
      return { view, ms: Date.now() - start, lastStatus };
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout ${runId} lastStatus=${lastStatus}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main() {
  const stamps: Stamp[] = [];
  const notes: Note[] = [];
  const failures: string[] = [];
  const git = execSync("git rev-parse HEAD").toString().trim();
  const gitShort = execSync("git rev-parse --short HEAD").toString().trim();

  stamps.push(nowStamp("script_start"));

  const health = await api("/api/health");
  stamps.push(nowStamp("health_ok"));
  notes.push(`health=${JSON.stringify(health)}`);

  const auth = await fetch(`${BASE}/api/auth/anonymous`, { method: "POST" });
  const setCookie = auth.headers.get("set-cookie") ?? "";
  const tokenRaw = setCookie.match(/futari_token=([^;]+)/)?.[1];
  const token = tokenRaw ? decodeURIComponent(tokenRaw) : undefined;
  if (!token) throw new Error("no token");
  stamps.push(nowStamp("auth_ok"));

  const couple = await api("/api/couples", {
    method: "POST",
    token,
    body: JSON.stringify({ isDemo: true }),
  });
  stamps.push(nowStamp("couple_created"));

  const date = tokyoToday();
  // LIVE requires real Place IDs (no coordinate-only invent).
  const meetSpot = {
    name: "東京駅",
    lat: 35.681236,
    lng: 139.767125,
    spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs",
  };
  const endSpot = {
    name: "東京駅",
    lat: 35.681236,
    lng: 139.767125,
    spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs",
  };
  const sessionInput = {
    dateTokyo: date,
    startTime: "13:00",
    endTime: "18:00",
    meet: meetSpot,
    end: endSpot,
    budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    preferences: [
      {
        id: "pref_self",
        subject: "SELF",
        content: "のんびり過ごすデート。気になること：カフェ",
        priority: "PREFER",
        source: "SELF_REPORT",
      },
      {
        id: "pref_partner",
        subject: "PARTNER",
        content: "甘いもの",
        priority: "MUST",
        source: "PARTNER_STATEMENT_REPORTED",
      },
    ],
    fixedAppointments: [],
    autoApply: {
      enabled: false,
      acknowledgedScope: null,
      validUntil: null,
    },
    travelMode: "WALK",
    areaName: "東京駅周辺",
    areaLat: 35.681236,
    areaLng: 139.767125,
    radiusMeters: 2500,
  };
  const session = await api(`/api/couples/${couple.id}/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify(sessionInput),
  });
  stamps.push(nowStamp("session_created"));
  notes.push(`sessionId=${session.sessionId} dateTokyo=${date}`);

  const planStart = nowStamp("initial_plan_post");
  stamps.push(planStart);
  const init = await api(`/api/sessions/${session.sessionId}/runs`, {
    method: "POST",
    token,
    headers: { "Idempotency-Key": `arch-v2-${session.sessionId}` },
    body: JSON.stringify({ kind: "INITIAL_PLAN" }),
  });
  notes.push(`initialRunId=${init.runId} duplicated=${Boolean(init.duplicated)}`);

  let first = await waitRun(token, init.runId);
  // Answer walk / other planner questions until SUCCEEDED or hard fail
  let walkAnswers = 0;
  while (first.lastStatus === "WAITING_INPUT" && walkAnswers < 5) {
    const q = first.view.run.waitingQuestion;
    notes.push(`WAITING_INPUT q=${q?.id}: ${q?.prompt ?? ""}`);
    const answer =
      q?.id === "q_long_walk"
        ? "このまま徒歩で続ける"
        : q?.options?.[0] ?? "はい";
    stamps.push(nowStamp(`answer_${q?.id ?? walkAnswers}`));
    await api(`/api/runs/${init.runId}/answers`, {
      method: "POST",
      token,
      body: JSON.stringify({ questionId: q.id, answer }),
    });
    walkAnswers += 1;
    first = await waitRun(token, init.runId);
  }

  const planReady = nowStamp("initial_plan_terminal");
  stamps.push(planReady);
  notes.push(
    `initial terminal status=${first.lastStatus} clientWaitMs=${first.ms} walkAnswers=${walkAnswers}`,
  );

  const snap1 = await api(`/api/sessions/${session.sessionId}`, { token });
  const items = snap1.plan?.items ?? [];
  notes.push(
    `planVersion=${snap1.session.currentPlanVersion} items=${items.length} validation=${snap1.plan?.validation?.state}`,
  );

  if (first.lastStatus === "FAILED" || first.lastStatus === "INTERRUPTED" || first.lastStatus === "CANCELLED") {
    failures.push(`initial plan ended ${first.lastStatus}: ${first.view.run.error ?? ""}`);
  }
  if (!snap1.plan || snap1.session.currentPlanVersion == null) {
    failures.push("no plan after initial run");
  }
  if (failures.length) {
    const payload = {
      ok: false,
      stoppedAt: "after_initial_plan",
      git,
      gitShort,
      base: BASE,
      coupleId: couple.id,
      sessionId: session.sessionId,
      initialRunId: init.runId,
      stamps,
      notes,
      failures,
      lastRun: first.view.run,
    };
    mkdirSync("docs/reports", { recursive: true });
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  // Mark session progressed so reflection path is realistic
  await api(`/api/sessions/${session.sessionId}/progress`, {
    method: "POST",
    token,
    body: JSON.stringify({ confirm: true, status: "CONFIRMED" }),
  });
  stamps.push(nowStamp("session_confirmed"));

  const reflectionPost = nowStamp("reflection_post");
  stamps.push(reflectionPost);
  const reflBody = {
    title: "今日の振り返り",
    note: "長く立つのがしんどいと言っていた。カフェで座れてよかった。甘いものも喜んでいた。",
    mood: "relaxed" as const,
    planVersion: snap1.session.currentPlanVersion,
    visits: items.slice(0, 3).map((it: { id: string; spotId: string }) => ({
      planItemId: it.id,
      spotId: it.spotId,
      visited: true,
      rating: "good" as const,
    })),
  };
  const saved = await api(`/api/sessions/${session.sessionId}/reflections`, {
    method: "POST",
    token,
    body: JSON.stringify(reflBody),
  });
  stamps.push(nowStamp("reflection_post_response"));
  const reflectionId = saved.reflection.id as string;
  const analysisRunId = saved.reflection.analysisRunId as string | null;
  notes.push(
    `reflectionId=${reflectionId} analysisEnqueued=${saved.analysisEnqueued} analysisRunId=${analysisRunId} analysisStatus=${saved.reflection.analysisStatus}`,
  );

  if (!analysisRunId) {
    failures.push("no analysisRunId after reflections POST");
    const payload = { ok: false, stoppedAt: "after_reflection_post", git, gitShort, base: BASE, coupleId: couple.id, sessionId: session.sessionId, stamps, notes, failures, saved };
    mkdirSync("docs/reports", { recursive: true });
    writeFileSync(OUT, JSON.stringify(payload, null, 2));
    console.log(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  let refl = await waitRun(token, analysisRunId);
  notes.push(`reflection first terminal status=${refl.lastStatus} clientWaitMs=${refl.ms}`);

  if (refl.lastStatus === "WAITING_INPUT") {
    const q = refl.view.run.waitingQuestion;
    notes.push(`reflection WAITING_INPUT q=${q?.id}: ${q?.prompt ?? ""}`);
    stamps.push(nowStamp("reflection_answer"));
    await api(`/api/runs/${analysisRunId}/answers`, {
      method: "POST",
      token,
      body: JSON.stringify({
        questionId: q.id,
        answer: q?.options?.[0] ?? "はい。長く立つのがしんどいと言っていた",
      }),
    });
    refl = await waitRun(token, analysisRunId);
    notes.push(`reflection after answer status=${refl.lastStatus} clientWaitMs=${refl.ms}`);
  }
  stamps.push(nowStamp("reflection_terminal"));

  if (refl.lastStatus !== "SUCCEEDED") {
    failures.push(`reflection ended ${refl.lastStatus}: ${refl.view.run.error ?? ""}`);
  }

  const snapRef = await api(`/api/sessions/${session.sessionId}`, { token });
  const pendingMem = (snapRef.approvals as { kind: string; status: string; id: string; targetCandidateId?: string; summary?: string; createdAt?: string }[]).find(
    (a) => a.kind === "MEMORY_SAVE" && a.status === "PENDING",
  );
  notes.push(
    `approvals=${(snapRef.approvals as { id: string; kind: string; status: string }[]).map((a) => `${a.kind}:${a.status}`).join(",") || "(none)"}`,
  );

  if (!pendingMem) {
    failures.push("no PENDING MEMORY_SAVE after reflection");
  } else {
    stamps.push(nowStamp("memory_approve"));
    await api(`/api/approvals/${pendingMem.id}/decision`, {
      method: "POST",
      token,
      body: JSON.stringify({ decision: "APPROVE" }),
    });
    stamps.push(nowStamp("memory_approved"));
  }

  const afterMem = await api(`/api/sessions/${session.sessionId}`, { token });
  const memories = (afterMem.memories ?? []) as {
    id: string;
    scope: string;
    confirmation: string;
    content: string;
    planDirectives?: unknown[];
    targetSessionId?: string | null;
  }[];
  notes.push(
    `memoriesAfterApprove=${memories.map((m) => `${m.id}:${m.scope}:${m.confirmation}:target=${m.targetSessionId ?? "null"}`).join(" | ") || "(none)"}`,
  );
  if (!memories.some((m) => m.confirmation === "USER_CONFIRMED")) {
    failures.push("no USER_CONFIRMED memory after approve");
  }

  // NEXT_DATE bind: create next session
  stamps.push(nowStamp("next_session_create"));
  const next = await api(`/api/couples/${couple.id}/sessions`, {
    method: "POST",
    token,
    body: JSON.stringify(session.input ?? sessionInput),
  });
  stamps.push(nowStamp("next_session_created"));
  notes.push(`nextSessionId=${next.sessionId}`);

  const snapNext = await api(`/api/sessions/${next.sessionId}`, { token });
  // memories on couple are shared; re-fetch via first session or check targetSessionId after bind
  const afterBind = await api(`/api/sessions/${session.sessionId}`, { token });
  const bound = (afterBind.memories as typeof memories).filter(
    (m) => m.scope === "NEXT_DATE" && m.targetSessionId === next.sessionId,
  );
  notes.push(
    `nextDateBound=${bound.map((m) => m.id).join(",") || "(none)"} nextPlanVersion=${snapNext.session.currentPlanVersion}`,
  );
  if (!bound.length) {
    // bindNextDateMemories may run on createSession — check all NEXT_DATE with any target
    const anyBound = (afterBind.memories as typeof memories).filter(
      (m) => m.scope === "NEXT_DATE" && m.targetSessionId,
    );
    if (!anyBound.length) failures.push("NEXT_DATE memory not bound to next session");
    else notes.push(`boundElsewhere=${anyBound.map((m) => `${m.id}->${m.targetSessionId}`).join(",")}`);
  }

  const payload = {
    ok: failures.length === 0,
    stoppedAt: failures.length ? "completed_with_failures" : "completed",
    git,
    gitShort,
    base: BASE,
    revisionExpected: "futari-log-00020-qz9",
    coupleId: couple.id,
    sessionId: session.sessionId,
    nextSessionId: next.sessionId,
    initialRunId: init.runId,
    reflectionId,
    analysisRunId,
    pendingApprovalId: pendingMem?.id ?? null,
    clientPlanWaitMs: planReady.epochMs - planStart.epochMs,
    clientReflectionEnqueueToTerminalMs:
      stamps.find((s) => s.label === "reflection_terminal")!.epochMs -
      stamps.find((s) => s.label === "reflection_post")!.epochMs,
    stamps,
    notes,
    failures,
    initialRunCost: first.view.run.cost,
    reflectionRunCost: refl.view.run.cost,
    memories: (afterBind.memories as typeof memories).map((m) => ({
      id: m.id,
      scope: m.scope,
      confirmation: m.confirmation,
      targetSessionId: m.targetSessionId ?? null,
      content: m.content,
      planDirectives: m.planDirectives ?? [],
    })),
  };

  mkdirSync("docs/reports", { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
