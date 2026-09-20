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
  if (url.endsWith("/sessions") && method === "POST") {
    return { sessionId: "fx-success", input: fixtureSuccess.session.input } as T;
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
    const snap = snapshotFor(sessionMatch[1]);
    if (!snap) throw new Error("読み込み中…");
    return snap as T;
  }
  if (/\/api\/sessions\/[^/]+\/runs$/.test(url) && method === "POST") {
    return { runId: "run_fx" } as T;
  }
  if (/\/api\/sessions\/[^/]+\/progress$/.test(url) && method === "POST") {
    return { ok: true } as T;
  }
  if (/\/api\/sessions\/[^/]+\/scenarios$/.test(url) && method === "POST") {
    return { scenarioId: "scen_fx", runId: "run_fx" } as T;
  }
  if (/\/api\/sessions\/[^/]+\/message-draft$/.test(url) && method === "POST") {
    return { text: "東京駅集合でどうかな。", blocked: false } as T;
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
  if (/\/api\/couples\/[^/]+\/memory$/.test(url) && method === "GET") {
    return {
      ok: true,
      memories: [
        {
          id: "mem_fx",
          content: "長く立つのがしんどいと言っていた",
          active: true,
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
