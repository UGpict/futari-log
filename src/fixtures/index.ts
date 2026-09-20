import { planningInputSchema } from "@/contracts";
import type { MeResponse, SessionSnapshot } from "@/contracts";
import {
  fixtureApproval,
  fixtureFailed,
  fixtureMe,
  fixtureReplan,
  fixtureSuccess,
  fixturesEnabled,
  snapshotFor,
} from "./snapshots";

export { fixturesEnabled, snapshotFor, fixtureMe, fixtureSuccess, fixtureFailed, fixtureApproval, fixtureReplan };

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
  if (url === "/api/couples" && method === "POST") return { id: "cpl_fixture" } as T;
  if (/^\/api\/couples\/[^/]+\/sessions$/.test(url) && method === "GET") {
    return { plans: [...calendarSnapshots.values()].map((snap) => ({ id: snap.session.id, date: snap.session.input.dateTokyo, startTime: snap.session.input.startTime, endTime: snap.session.input.endTime, status: snap.session.status, title: snap.plan?.items.map((item) => snap.spots[item.spotId]?.name).filter(Boolean).join("・") || "作成中のプラン" })) } as T;
  }
  if (url.endsWith("/sessions") && method === "POST") {
    const snap = structuredClone(fixtureSuccess);
    snap.session.input = planningInputSchema.parse(JSON.parse(String(init?.body ?? "{}")));
    snap.session.id = `fx-created-${calendarSnapshots.size}`;
    snap.session.status = "DRAFT";
    calendarSnapshots.set(snap.session.id, snap);
    return { sessionId: snap.session.id, input: snap.session.input } as T;
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
    const snap = calendarSnapshots.get(sessionMatch[1]) ?? snapshotFor(sessionMatch[1]);
    if (!snap) throw new Error("読み込み中…");
    return snap as T;
  }
  if (/\/api\/sessions\/[^/]+\/runs$/.test(url) && method === "POST") {
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
  if (/\/api\/approvals\/[^/]+\/decision$/.test(url) && method === "POST") {
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
