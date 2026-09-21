import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, unlinkSync, openSync, closeSync } from "node:fs";
import { dirname, join } from "node:path";
import { getEnv } from "@/config/env";
import type { Approval, AppEvent, Memory, Run, Session } from "@/domain/schemas";
import { DEADLINES_MS, MODEL_SETTINGS_VERSION, PROMPT_VERSION, SCHEMA_VERSION, TOOL_VERSION } from "@/config/settings";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import * as split from "./firestoreSplit";
import { calendarTitle, listedOnCalendar } from "./calendarFields";
import { replanStartError } from "@/domain/plan/replanOrder";
import type {
  CoupleBundle,
  Db,
  FoundApproval,
  FoundMemory,
  FoundRun,
  FoundSession,
  IdempotencyRecord,
  SessionBundle,
} from "./types";
import { emptyDb, emptyCoupleBundle, emptySessionBundle } from "./types";

export type {
  CoupleBundle,
  Db,
  FoundApproval,
  FoundMemory,
  FoundRun,
  FoundSession,
  IdempotencyRecord,
  SessionBundle,
} from "./types";

const STORE_PATH = join(process.cwd(), ".data", "store.json");
const LOCK_PATH = join(process.cwd(), ".data", "store.lock");

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

function useFirestore() {
  return getEnv().dataBackend === "firestore";
}

export async function withStore<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  if (useFirestore()) {
    throw new Error("blob withStore is disabled for Firestore; use targeted couple/session/run documents");
  }
  return withFile(fn, true);
}

export async function readStore<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  if (useFirestore()) {
    throw new Error("blob readStore is disabled for Firestore; use targeted couple/session/run documents");
  }
  return withFile(fn, false);
}

export function findSession(db: Db, sessionId: string): FoundSession | null {
  for (const couple of Object.values(db.couples)) {
    const bundle = couple.sessions[sessionId];
    if (bundle) return { couple, bundle };
  }
  return null;
}

export function findRun(db: Db, runId: string): FoundRun | null {
  for (const couple of Object.values(db.couples)) {
    for (const bundle of Object.values(couple.sessions)) {
      const run = bundle.runs[runId];
      if (run) return { couple, bundle, run };
    }
  }
  return null;
}

export function findApproval(db: Db, approvalId: string): FoundApproval | null {
  for (const couple of Object.values(db.couples)) {
    const approval = couple.approvals[approvalId];
    if (approval) return { couple, approval };
  }
  return null;
}

export function findMemory(db: Db, memoryId: string): FoundMemory | null {
  for (const couple of Object.values(db.couples)) {
    const memory = couple.memories[memoryId];
    if (memory) return { couple, memory };
  }
  return null;
}

export async function putCouple(bundle: CoupleBundle): Promise<void> {
  if (useFirestore()) return split.putCouple(bundle);
  await withFile((db) => {
    db.couples[bundle.couple.id] = bundle;
  }, true);
}

export async function loadCouple(coupleId: string): Promise<CoupleBundle | null> {
  if (useFirestore()) return split.loadCouple(coupleId);
  return withFile((db) => db.couples[coupleId] ?? null, false);
}

export async function withCouple<T>(
  coupleId: string,
  fn: (couple: CoupleBundle | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (useFirestore()) return split.withCouple(coupleId, fn, persist);
  return withFile((db) => fn(db.couples[coupleId] ?? null), persist);
}

export async function withSession<T>(
  sessionId: string,
  fn: (found: FoundSession | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (useFirestore()) return split.withSession(sessionId, fn, persist);
  return withFile((db) => fn(findSession(db, sessionId)), persist);
}

export async function withRun<T>(
  runId: string,
  fn: (found: FoundRun | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (useFirestore()) return split.withRun(runId, fn, persist);
  return withFile((db) => fn(findRun(db, runId)), persist);
}

export async function withApproval<T>(
  approvalId: string,
  fn: (found: FoundApproval | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (useFirestore()) return split.withApproval(approvalId, fn, persist);
  return withFile((db) => fn(findApproval(db, approvalId)), persist);
}

export async function withMemory<T>(
  memoryId: string,
  fn: (found: FoundMemory | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (useFirestore()) return split.withMemory(memoryId, fn, persist);
  return withFile((db) => fn(findMemory(db, memoryId)), persist);
}

export async function getRun(runId: string): Promise<FoundRun | null> {
  return withRun(runId, (found) => found, false);
}

export async function getSession(sessionId: string): Promise<FoundSession | null> {
  return withSession(sessionId, (found) => found, false);
}

function gitSha(): string | null {
  return process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
}

export async function insertPendingRun(input: {
  uid: string;
  sessionId: string;
  kind: Run["kind"];
  trigger?: string | null;
  instruction?: string | null;
  targetPlanItemId?: string | null;
  basePlanVersion?: number | null;
  reflectionId?: string | null;
  reflectionContentVersion?: number | null;
  idempotencyKey?: string | null;
  bodyHash: string;
}): Promise<
  | { ok: true; duplicated: true; runId: string }
  | { ok: true; duplicated: false; runId: string }
  | { ok: false; status: number; error: string }
> {
  const env = getEnv();
  const id = newId("run");
  const run: Run = {
    id,
    coupleId: "",
    sessionId: input.sessionId,
    ownerUid: input.uid,
    kind: input.kind,
    status: "PENDING",
    mode: "LIVE",
    displayRuntime: env.runtime === "MOCK" ? "MOCK" : "LIVE",
    createdAt: realNowIso(),
    startedAt: null,
    finishedAt: null,
    deadlineAt: new Date(Date.now() + DEADLINES_MS[input.kind]).toISOString(),
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    trigger: input.trigger ?? null,
    instruction: input.instruction ?? null,
    targetPlanItemId: input.targetPlanItemId ?? null,
    basePlanVersion: null,
    resultPlanVersion: null,
    waitingQuestion: null,
    waitingApprovalId: null,
    reflectionId: input.reflectionId ?? null,
    reflectionContentVersion: input.reflectionContentVersion ?? null,
    error: null,
    cost: {
      llmUsd: env.runtime === "MOCK" ? 0 : null,
      llmJpy: env.runtime === "MOCK" ? 0 : null,
      apiJpy: env.runtime === "MOCK" ? 0 : null,
      mundaneCalls: 0,
      hardCalls: 0,
      unaccountedCalls: 0,
    },
    versions: {
      schema: SCHEMA_VERSION,
      prompt: PROMPT_VERSION,
      tool: TOOL_VERSION,
      modelSettings: MODEL_SETTINGS_VERSION,
      git: gitSha(),
    },
  };

  if (useFirestore()) {
    return split.insertPendingRun({ ...input, run });
  }

  return withFile((db) => {
    if (input.idempotencyKey) {
      const prev = db.idempotency[input.idempotencyKey];
      if (prev) {
        if (prev.uid !== input.uid || prev.bodyHash !== input.bodyHash || prev.op !== "startRun") {
          return { ok: false as const, status: 409, error: "idempotency conflict" };
        }
        return { ok: true as const, duplicated: true, ...(prev.response as { runId: string }) };
      }
    }
    const found = findSession(db, input.sessionId);
    if (!found) return { ok: false as const, status: 404, error: "session not found" };
    if (found.couple.couple.ownerUid !== input.uid) {
      return { ok: false as const, status: 403, error: "forbidden" };
    }
    const currentPlan = found.bundle.session.currentPlanVersion
      ? found.bundle.planHistory[String(found.bundle.session.currentPlanVersion)]
      : undefined;
    const replanError = replanStartError({
      kind: input.kind,
      instruction: input.instruction,
      basePlanVersion: input.basePlanVersion,
      currentPlanVersion: found.bundle.session.currentPlanVersion,
      targetPlanItemId: input.targetPlanItemId,
      currentItemIds: currentPlan?.items.map((item) => item.id) ?? null,
    });
    if (replanError) return { ok: false as const, ...replanError };
    const active = Object.values(found.bundle.runs).filter((r) =>
      ["PENDING", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL"].includes(r.status),
    );
    if (active.length >= 1 && input.kind !== "REFLECTION") {
      return {
        ok: false as const,
        status: 409,
        error: `concurrent run: ${active.map((r) => `${r.id}:${r.status}:${r.kind}`).join(",")}`,
      };
    }
    const today = realNowIso().slice(0, 10);
    const countToday = Object.values(found.couple.sessions).reduce((n, b) => {
      return n + Object.values(b.runs).filter((r) => r.createdAt.startsWith(today)).length;
    }, 0);
    if (countToday >= 20) return { ok: false as const, status: 429, error: "daily cap" };
    run.coupleId = found.couple.couple.id;
    run.basePlanVersion = found.bundle.session.currentPlanVersion;
    found.bundle.runs[id] = run;
    if (input.idempotencyKey) {
      db.idempotency[input.idempotencyKey] = {
        key: input.idempotencyKey,
        uid: input.uid,
        target: input.sessionId,
        op: "startRun",
        bodyHash: input.bodyHash,
        status: 202,
        response: { runId: id },
      };
    }
    return { ok: true as const, duplicated: false, runId: id };
  }, true);
}

export async function appendRunEvent(runId: string, event: AppEvent): Promise<void> {
  if (useFirestore()) return split.appendRunEvent(runId, event);
  await withFile((db) => {
    const found = findRun(db, runId);
    if (!found) return;
    found.bundle.events[event.eventId] = event;
  }, true);
}

export async function nextEventSeq(runId: string): Promise<number> {
  if (useFirestore()) {
    const found = await getRun(runId);
    if (!found) return 0;
    return Object.values(found.bundle.events)
      .filter((e) => e.runId === runId)
      .reduce((n, e) => Math.max(n, e.seq + 1), Object.keys(found.bundle.events).length);
  }
  return withFile((db) => {
    const found = findRun(db, runId);
    if (!found) return 0;
    return Object.keys(found.bundle.events).length;
  }, false);
}

export async function patchRunDoc(runId: string, patch: Partial<Run>): Promise<void> {
  if (useFirestore()) return split.patchRunDoc(runId, patch);
  await withFile((db) => {
    const found = findRun(db, runId);
    if (!found) return;
    Object.assign(found.run, patch);
  }, true);
}

export async function listCalendarRows(
  uid: string,
  coupleId: string,
  range: { from?: string | null; to?: string | null },
) {
  if (useFirestore()) return split.listCalendarPlansDocs(uid, coupleId, range);
  return withFile((db) => {
    const couple = db.couples[coupleId];
    if (!couple) return { ok: false as const, status: 404, error: "couple not found" };
    if (couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const plans = Object.values(couple.sessions)
      .filter((bundle) => listedOnCalendar(bundle.session))
      .filter((bundle) => {
        const date = bundle.session.input.dateTokyo;
        if (range.from && date < range.from) return false;
        if (range.to && date > range.to) return false;
        return true;
      })
      .map((bundle) => ({
        id: bundle.session.id,
        date: bundle.session.input.dateTokyo,
        startTime: bundle.session.input.startTime,
        endTime: bundle.session.input.endTime,
        status: bundle.session.status,
        title: calendarTitle(bundle),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
    return { ok: true as const, plans };
  }, false);
}

export async function ownerCoupleIdFromStore(uid: string): Promise<string | null> {
  if (useFirestore()) return split.ownerCoupleIdDoc(uid);
  return withFile((db) => {
    const hit = Object.values(db.couples).find((c) => c.couple.ownerUid === uid);
    return hit?.couple.id ?? null;
  }, false);
}

export async function getReplayFromStore(uid: string, replayId: string) {
  if (useFirestore()) return split.getReplayDoc(uid, replayId);
  return withFile((db) => {
    for (const couple of Object.values(db.couples)) {
      if (couple.couple.ownerUid !== uid) continue;
      const replay = couple.replays[replayId];
      if (replay) return { coupleId: couple.couple.id, replay };
    }
    return null;
  }, false);
}

export async function demoResetStore(uid: string, keepReplays: boolean) {
  if (useFirestore()) return split.demoResetDocs(uid, keepReplays);
  await withFile((db) => {
    for (const [id, couple] of Object.entries(db.couples)) {
      if (couple.couple.ownerUid !== uid || !couple.couple.isDemo) continue;
      const replays = keepReplays ? couple.replays : {};
      db.couples[id] = {
        couple: couple.couple,
        memories: {},
        memoryCandidates: {},
        reflections: {},
        approvals: {},
        sessions: {},
        replays,
      };
    }
  }, true);
}

export { calendarTitle, listedOnCalendar, emptySessionBundle, emptyCoupleBundle };
