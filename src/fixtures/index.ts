import { decideFixtureProposal } from "./proposal-decision";
import { createFixtureReplan } from "./replan-proposal";
import { planningInputSchema } from "@/contracts";
import type { MeResponse, SessionSnapshot } from "@/contracts";
import {
  fixtureApproval,
  fixtureFailed,
  fixtureFinalReview,
  fixtureMe,
  fixtureReplanning,
  fixtureReplan,
  fixtureSuccess,
  fixturesEnabled,
  snapshotFor,
} from "./snapshots";

export { fixturesEnabled, snapshotFor, fixtureMe, fixtureSuccess, fixtureFailed, fixtureApproval, fixtureReplan, fixtureFinalReview, fixtureReplanning };

// Mutable only in the explicitly enabled UI fixture runtime.
const inactiveMemoryIds = new Set<string>();
const upcoming = structuredClone(fixtureSuccess);
upcoming.session.id = "fx-upcoming";
upcoming.session.input.dateTokyo = "2026-09-24";
upcoming.session.status = "CONFIRMED";
for (const item of upcoming.plan?.items ?? []) {
  item.startAt = item.startAt.replace("2026-09-19", "2026-09-24");
  item.endAt = item.endAt.replace("2026-09-19", "2026-09-24");
}
const calendarSnapshots = new Map<string, SessionSnapshot>([
  [fixtureSuccess.session.id, fixtureSuccess], [upcoming.session.id, upcoming],
]);
const generatedSnapshots = new Map<string, SessionSnapshot>();
const generationReadyAt = new Map<string, number>();
const interactiveSnapshots = new Map<string, SessionSnapshot>();
const replanReadyAt = new Map<string, number>();
const FIXTURE_GENERATION_MS = 2_800;
const FIXTURE_REPLAN_MS = 2_800;

function interactiveSnapshot(sessionId: string) {
  let snapshot = interactiveSnapshots.get(sessionId);
  if (!snapshot) {
    const source = snapshotFor(sessionId);
    if (!source) return null;
    snapshot = structuredClone(source);
    interactiveSnapshots.set(sessionId, snapshot);
  }
  return snapshot;
}

function finishFixtureReplan(sessionId: string, snapshot: SessionSnapshot) {
  const readyAt = replanReadyAt.get(sessionId);
  if (readyAt == null || Date.now() < readyAt) return;
  replanReadyAt.delete(sessionId);
  const run = snapshot.runs.at(-1);
  if (!run || run.kind !== "REPLAN") return;
  const result = createFixtureReplan(snapshot);
  if (!result) return;
  const { proposal, approval, spots } = result;
  snapshot.spots = spots;
  snapshot.proposedPlan = proposal;
  snapshot.approvals = [approval];
  run.status = "WAITING_APPROVAL";
  run.waitingApprovalId = approval.id;
  run.resultPlanVersion = proposal.version;
}

function startFixtureReplan(sessionId: string, snapshot: SessionSnapshot, body: Record<string, unknown>) {
  const previous = snapshot.runs.at(-1) ?? fixtureSuccess.runs[0];
  snapshot.runs.push({
    ...structuredClone(previous),
    id: `run_replan_${Date.now()}`,
    sessionId,
    kind: "REPLAN",
    status: "RUNNING",
    instruction: typeof body.instruction === "string" ? body.instruction : undefined,
    targetPlanItemId: typeof body.targetPlanItemId === "string" ? body.targetPlanItemId : undefined,
    basePlanVersion: typeof body.basePlanVersion === "number" ? body.basePlanVersion : snapshot.session.currentPlanVersion,
    resultPlanVersion: null,
    waitingApprovalId: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
  });
  snapshot.proposedPlan = undefined;
  snapshot.approvals = [];
  replanReadyAt.set(sessionId, Date.now() + FIXTURE_REPLAN_MS);
  return snapshot.runs.at(-1)!.id;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fixtureResponse<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const url = path.split("?")[0];

  if (url === "/api/me" && method === "GET") return fixtureMe as T;
  if (url === "/api/auth/anonymous" && method === "POST") {
    return { uid: fixtureMe.uid, runtime: "MOCK" } as T;
  }
  if ((url === "/api/auth/login" || url === "/api/auth/signup") && method === "POST") {
    return {
      uid: fixtureMe.uid,
      email: "sample@example.com",
      emailVerified: url === "/api/auth/login",
      runtime: "MOCK",
      authBackend: "mock",
    } as T;
  }
  if (url === "/api/auth/forgot-password" && method === "POST") {
    return { ok: true, runtime: "MOCK" } as T;
  }
  if (url === "/api/auth/logout" && method === "POST") {
    return { ok: true, runtime: "MOCK" } as T;
  }
  if (url === "/api/auth/verify" && method === "GET") {
    return { email: "sample@example.com", emailVerified: true } as T;
  }
  if (url === "/api/auth/verify" && method === "POST") {
    return { ok: true } as T;
  }
  if (url === "/api/places/search" && method === "GET") {
    const q = (path.split("?")[1] ? new URLSearchParams(path.split("?")[1]).get("q") : "") ?? "";
    const places = [
      { id: "mock:nagoya-station", name: "名古屋駅", lat: 35.170915, lng: 136.881537, address: "名古屋市中村区" },
      { id: "mock:tokyo-station-gallery", name: "東京駅", lat: 35.681236, lng: 139.767125, address: "東京都千代田区" },
    ].filter((place) => !q.trim() || place.name.includes(q.trim()));
    return { query: q, state: places.length ? "ok" : "empty", places, error: null } as T;
  }
  if (url === "/api/places/photos" && method === "GET") {
    const ids = (path.split("?")[1] ? new URLSearchParams(path.split("?")[1]).get("ids") : "") ?? "";
    return {
      photos: ids.split(",").filter(Boolean).map((id, index) => ({
        placeId: id,
        state: "ready",
        kind: "VENUE",
        source: "places",
        imageUrl: `/images/itinerary/${index % 2 === 0 ? "cafe" : "museum"}.jpg`,
        googleMapsUri: "https://maps.google.com/",
        authorAttributions: [{ displayName: "goodspoon Cheese Sweets & Cheese Brunch（グッドスプーン）エキュート上野店", uri: "https://maps.google.com/" }],
      })),
    } as T;
  }
  if (url === "/api/couples" && method === "POST") return { id: "cpl_fixture" } as T;
  if (/^\/api\/couples\/[^/]+\/sessions$/.test(url) && method === "GET") {
    return { plans: [...calendarSnapshots.values()].map((snap) => ({ id: snap.session.id, date: snap.session.input.dateTokyo, startTime: snap.session.input.startTime, endTime: snap.session.input.endTime, status: snap.session.status, title: snap.plan?.items.map((item) => snap.spots[item.spotId]?.name).filter(Boolean).join("・") || "作成中のプラン" })) } as T;
  }
  if (url.endsWith("/sessions") && method === "POST") {
    const completed = structuredClone(fixtureSuccess);
    completed.session.input = planningInputSchema.parse(JSON.parse(String(init?.body ?? "{}")));
    completed.session.id = `fx-created-${calendarSnapshots.size}`;
    completed.session.status = "DRAFT";
    completed.runs = completed.runs.map((run) => ({ ...run, sessionId: completed.session.id }));
    if (completed.plan) {
      completed.plan.validation = {
        state: "CONDITIONAL",
        issues: [
          { code: "PRICE_UNKNOWN", severity: "WARNING", itemIds: ["it_1"], message: "Places の価格帯は単位不明のため二人料金にできません", evidenceIds: [] },
          { code: "PRICE_UNVERIFIED", severity: "WARNING", itemIds: ["it_lock"], message: "料金情報を確認できませんでした", evidenceIds: [] },
          { code: "PRICE_UNKNOWN", severity: "WARNING", itemIds: ["it_3"], message: "Places の価格帯は単位不明のため二人料金にできません", evidenceIds: [] },
        ],
      };
    }

    const pending = structuredClone(completed);
    pending.session.currentPlanVersion = null;
    pending.plan = null;
    pending.spots = {};
    pending.runs = [];
    pending.events = [];

    generatedSnapshots.set(completed.session.id, completed);
    calendarSnapshots.set(completed.session.id, pending);
    return { sessionId: completed.session.id, input: completed.session.input } as T;
  }
  if (url === "/api/sessions/fx-error") {
    throw new Error("fixture failure");
  }
  if (url === "/api/sessions/fx-loading") {
    await delay(800);
    return snapshotFor("fx-loading") as T;
  }
  const sessionMatch = url.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch && method === "GET") {
    const sessionId = sessionMatch[1];
    if (sessionId === "fx-final-review" || sessionId === "fx-approval") {
      const interactive = interactiveSnapshot(sessionId);
      if (!interactive) throw new Error("モックを読み込めませんでした");
      finishFixtureReplan(sessionId, interactive);
      return structuredClone(interactive) as T;
    }
    const completed = generatedSnapshots.get(sessionId);
    const readyAt = generationReadyAt.get(sessionId);
    if (completed && readyAt != null && Date.now() >= readyAt) {
      calendarSnapshots.set(sessionId, completed);
      interactiveSnapshots.set(sessionId, completed);
      generatedSnapshots.delete(sessionId);
      generationReadyAt.delete(sessionId);
    }
    const interactive = interactiveSnapshots.get(sessionId);
    if (interactive) {
      finishFixtureReplan(sessionId, interactive);
      return structuredClone(interactive) as T;
    }
    const snap = calendarSnapshots.get(sessionId) ?? snapshotFor(sessionId);
    if (!snap) throw new Error("読み込み中…");
    return snap as T;
  }
  if (/\/api\/sessions\/[^/]+\/runs$/.test(url) && method === "POST") {
    const sessionId = url.split("/")[3];
    if (sessionId === "fx-final-review" || sessionId === "fx-approval") {
      const snapshot = interactiveSnapshot(sessionId);
      if (!snapshot) throw new Error("モックを読み込めませんでした");
      const body = JSON.parse(String(init?.body ?? "{}"));
      return { runId: startFixtureReplan(sessionId, snapshot, body) } as T;
    }
    const interactive = interactiveSnapshots.get(sessionId);
    if (interactive) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return { runId: startFixtureReplan(sessionId, interactive, body) } as T;
    }
    const pending = calendarSnapshots.get(sessionId);
    const completed = generatedSnapshots.get(sessionId);
    if (pending && completed) {
      pending.runs = completed.runs.map((run) => ({
        ...run,
        status: "RUNNING",
        resultPlanVersion: null,
        finishedAt: null,
      }));
      pending.events = completed.events.slice(0, 1);
      generationReadyAt.set(sessionId, Date.now() + FIXTURE_GENERATION_MS);
    }
    return { runId: "run_fx" } as T;
  }
  if (/\/api\/sessions\/[^/]+\/progress$/.test(url) && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const snap = calendarSnapshots.get(url.split("/")[3]) ?? snapshotFor(url.split("/")[3]);
    if (snap && typeof body.status === "string") snap.session.status = body.status;
    return { ok: true } as T;
  }
  if (/\/api\/sessions\/[^/]+\/scenarios$/.test(url) && method === "POST") {
    return { scenarioId: "scen_fx", runId: "run_fx" } as T;
  }
  if (/\/api\/sessions\/[^/]+\/message-draft$/.test(url) && method === "POST") {
    return { text: "名古屋駅集合でどうかな。", blocked: false } as T;
  }
  if (url === "/api/fixtures/proposal-decision" && method === "POST") {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const snapshot = interactiveSnapshots.get(body.sessionId);
    if (!snapshot || !["APPROVE", "REJECT"].includes(body.decision)) throw new Error("変更案を読み込めませんでした");
    decideFixtureProposal(snapshot, body.approvalId, body.rowKey, body.decision);
    calendarSnapshots.set(body.sessionId, snapshot);
    return { ok: true } as T;
  }
  if (/\/api\/approvals\/[^/]+\/decision$/.test(url) && method === "POST") {
    const approvalId = url.split("/")[3];
    const interactive = [...interactiveSnapshots.values()].find((snapshot) => snapshot.approvals.some((approval) => approval.id === approvalId));
    if (interactive) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const approval = interactive.approvals.find((item) => item.id === approvalId)!;
      if (body.decision === "APPROVE" && interactive.proposedPlan) {
        interactive.plan = structuredClone(interactive.proposedPlan);
        interactive.session.currentPlanVersion = interactive.plan.version;
        approval.status = "APPROVED";
      } else {
        approval.status = "REJECTED";
      }
      approval.consumedAt = new Date().toISOString();
      interactive.proposedPlan = undefined;
      const run = interactive.runs.find((item) => item.id === approval.runId);
      if (run) {
        run.status = "SUCCEEDED";
        run.finishedAt = new Date().toISOString();
        run.waitingApprovalId = null;
      }
      return { ok: true } as T;
    }
    return { ok: true } as T;
  }
  if (/\/api\/runs\/[^/]+\/answers$/.test(url) && method === "POST") {
    return { ok: true } as T;
  }
  if (/\/api\/runs\/[^/]+\/replay-export$/.test(url) && method === "POST") {
    return { replayId: "rep_fx" } as T;
  }
  const deactivateMatch = url.match(/^\/api\/memory\/([^/]+)\/deactivate$/);
  if (deactivateMatch && method === "POST") {
    if (deactivateMatch[1] !== "mem_fx") throw new Error("メモが見つかりません");
    inactiveMemoryIds.add(deactivateMatch[1]);
    return { ok: true } as T;
  }
  if (/\/api\/couples\/[^/]+\/memory$/.test(url) && method === "GET") {
    return {
      ok: true,
      memories: [
        {
          id: "mem_fx",
          content: "長く立つのがしんどいと言っていた",
          active: !inactiveMemoryIds.has("mem_fx"),
          strength: "SOFT",
          sourceType: "PARTNER_STATEMENT_REPORTED",
          evidenceQuote: "長く立つのがしんどいと言っていた",
          confirmation: "USER_CONFIRMED",
          version: 1,
        },
      ],
      candidates: [{ id: "mc_fx", content: "未承認の候補", evidenceQuote: "根拠" }],
    } as T;
  }
  if (/\/api\/replays\/[^/]+$/.test(url) && method === "GET") {
    return {
      replay: {
        id: "rep_fx",
        notes: "fixture の再生。外部APIも新規課金もしません",
        events: fixtureSuccess.events,
        plan: fixtureSuccess.plan,
        spots: Object.values(fixtureSuccess.spots).map((s) => ({ id: s.id, name: s.name })),
        costSnapshot: fixtureSuccess.runs[0].cost,
      },
    } as T;
  }
  if (method === "POST") return { ok: true } as T;
  throw new Error(`no fixture for ${method} ${url}`);
}

export type { MeResponse, SessionSnapshot };
