import type {
  Approval,
  AppEvent,
  Couple,
  Evidence,
  Memory,
  MemoryCandidate,
  Plan,
  ReplayManifest,
  Reflection,
  Run,
  ScenarioOverlay,
  Session,
  Spot,
} from "@/domain/schemas";
import type { AgentMemories } from "@/server/agent/types";

export type CoupleBundle = {
  couple: Couple;
  memories: Record<string, Memory>;
  memoryCandidates: Record<string, MemoryCandidate>;
  reflections: Record<string, Reflection>;
  approvals: Record<string, Approval>;
  sessions: Record<string, SessionBundle>;
  replays: Record<string, ReplayManifest>;
  agentMemories?: AgentMemories;
  runCountByDate?: Record<string, number>;
};

export type SessionBundle = {
  session: Session;
  planHistory: Record<string, Plan>;
  runs: Record<string, Run>;
  events: Record<string, AppEvent>;
  scenarios: Record<string, ScenarioOverlay>;
  spots: Record<string, Spot>;
  evidence: Record<string, Evidence>;
};

export type IdempotencyRecord = {
  key: string;
  uid: string;
  target: string;
  op: string;
  bodyHash: string;
  status: number;
  response: unknown;
};

export type Db = {
  couples: Record<string, CoupleBundle>;
  idempotency: Record<string, IdempotencyRecord>;
  tokens: Record<string, { uid: string; createdAt: string }>;
};

export type FoundSession = { couple: CoupleBundle; bundle: SessionBundle };
export type FoundRun = { couple: CoupleBundle; bundle: SessionBundle; run: Run };
export type FoundApproval = { couple: CoupleBundle; approval: Approval };
export type FoundMemory = { couple: CoupleBundle; memory: Memory };

export function emptyCoupleBundle(couple: Couple): CoupleBundle {
  return {
    couple,
    memories: {},
    memoryCandidates: {},
    reflections: {},
    approvals: {},
    sessions: {},
    replays: {},
    agentMemories: {},
    runCountByDate: {},
  };
}

export function emptySessionBundle(session: Session): SessionBundle {
  return {
    session,
    planHistory: {},
    runs: {},
    events: {},
    scenarios: {},
    spots: {},
    evidence: {},
  };
}

export function emptyDb(): Db {
  return { couples: {}, idempotency: {}, tokens: {} };
}
