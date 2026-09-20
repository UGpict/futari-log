import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync, openSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { getEnv } from "@/config/env";
import { adminDb } from "@/server/firebase/admin";
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

export type CoupleBundle = {
  couple: Couple;
  memories: Record<string, Memory>;
  memoryCandidates: Record<string, MemoryCandidate>;
  reflections: Record<string, Reflection>;
  approvals: Record<string, Approval>;
  sessions: Record<string, SessionBundle>;
  replays: Record<string, ReplayManifest>;
  agentMemories?: import("@/server/agent/types").AgentMemories;
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

const STORE_PATH = join(process.cwd(), ".data", "store.json");
const LOCK_PATH = join(process.cwd(), ".data", "store.lock");

function emptyDb(): Db {
  return { couples: {}, idempotency: {}, tokens: {} };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function acquireLock(): Promise<number> {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  for (let i = 0; i < 80; i++) {
    try {
      return openSync(LOCK_PATH, "wx");
    } catch {
      await sleep(25);
    }
  }
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
  return openSync(LOCK_PATH, "wx");
}

function releaseLock(fd: number) {
  try {
    closeSync(fd);
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

function readDb(): Db {
  if (!existsSync(STORE_PATH)) return emptyDb();
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf8")) as Db;
  } catch {
    return emptyDb();
  }
}

function writeDb(db: Db) {
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, STORE_PATH);
}

const ROOT_DOC = "sys/root";

function parsePayload(raw: unknown): Db {
  if (typeof raw !== "string" || !raw) return emptyDb();
  try {
    const parsed = JSON.parse(raw) as Db;
    return {
      couples: parsed.couples ?? {},
      idempotency: parsed.idempotency ?? {},
      tokens: parsed.tokens ?? {},
    };
  } catch {
    return emptyDb();
  }
}

async function withFirestore<T>(fn: (db: Db) => T | Promise<T>, persist: boolean): Promise<T> {
  const ref = adminDb().doc(ROOT_DOC);
  if (!persist) {
    const snap = await ref.get();
    return fn(parsePayload(snap.data()?.payload));
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await adminDb().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const db = parsePayload(snap.data()?.payload);
        const before = JSON.stringify(db);
        const result = await fn(db);
        const after = JSON.stringify(db);
        if (after !== before) {
          tx.set(ref, { payload: after, updatedAt: new Date().toISOString() });
        }
        return result;
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("ABORTED") && !message.includes("lock timeout")) throw error;
      await sleep(40 * (attempt + 1));
    }
  }
  throw lastError;
}

async function withFile<T>(fn: (db: Db) => T | Promise<T>, persist: boolean): Promise<T> {
  const fd = await acquireLock();
  try {
    const db = readDb();
    const result = await fn(db);
    if (persist) writeDb(db);
    return result;
  } finally {
    releaseLock(fd);
  }
}

let firestoreWriteChain: Promise<unknown> = Promise.resolve();

function enqueueFirestoreWrite<T>(work: () => Promise<T>): Promise<T> {
  const done = firestoreWriteChain.then(work, work);
  firestoreWriteChain = done.then(
    () => undefined,
    () => undefined,
  );
  return done;
}

export async function withStore<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  if (getEnv().dataBackend === "firestore") return enqueueFirestoreWrite(() => withFirestore(fn, true));
  return withFile(fn, true);
}

export async function readStore<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  if (getEnv().dataBackend === "firestore") return withFirestore(fn, false);
  return withFile(fn, false);
}

export function findSession(
  db: Db,
  sessionId: string,
): { couple: CoupleBundle; bundle: SessionBundle } | null {
  for (const couple of Object.values(db.couples)) {
    const bundle = couple.sessions[sessionId];
    if (bundle) return { couple, bundle };
  }
  return null;
}

export function findRun(
  db: Db,
  runId: string,
): { couple: CoupleBundle; bundle: SessionBundle; run: Run } | null {
  for (const couple of Object.values(db.couples)) {
    for (const bundle of Object.values(couple.sessions)) {
      const run = bundle.runs[runId];
      if (run) return { couple, bundle, run };
    }
  }
  return null;
}

export function findApproval(
  db: Db,
  approvalId: string,
): { couple: CoupleBundle; approval: Approval } | null {
  for (const couple of Object.values(db.couples)) {
    const approval = couple.approvals[approvalId];
    if (approval) return { couple, approval };
  }
  return null;
}

export function findMemory(
  db: Db,
  memoryId: string,
): { couple: CoupleBundle; memory: Memory } | null {
  for (const couple of Object.values(db.couples)) {
    const memory = couple.memories[memoryId];
    if (memory) return { couple, memory };
  }
  return null;
}
