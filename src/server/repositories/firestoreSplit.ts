import type { DocumentData, Transaction } from "firebase-admin/firestore";
import { getEnv } from "@/config/env";
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
import { realNowIso } from "@/lib/time";
import { adminDb } from "@/server/firebase/admin";
import type { AgentId, AgentMemories, AgentMemory } from "@/server/agent/types";
import { AGENT_IDS } from "@/server/agent/types";
import { calendarTitle, listedOnCalendar } from "./calendarFields";
import {
  agentMemoryRef,
  approvalRef,
  candidateRef,
  coupleCol,
  coupleRef,
  eventRef,
  evidenceRef,
  idempotencyRef,
  lookupRef,
  memoryRef,
  planRef,
  reflectionRef,
  replayRef,
  runRef,
  scenarioRef,
  sessionRef,
  spotRef,
  sub,
  type DocLocation,
  type LookupKind,
} from "./layout";
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
import { emptyCoupleBundle, emptySessionBundle } from "./types";
import { splitCounts, type SplitCounts } from "./splitMap";
import { replanStartError } from "@/domain/plan/replanOrder";

type Tx = Transaction;

function db() {
  if (getEnv().dataBackend !== "firestore") {
    throw new Error("firestore split store requires DATA_BACKEND=firestore; file fallback is disabled");
  }
  return adminDb();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("ABORTED") && !message.includes("lock timeout")) throw error;
      await sleep(40 * (attempt + 1));
    }
  }
  throw lastError;
}

function asRecord<T>(snap: FirebaseFirestore.QuerySnapshot): Record<string, T> {
  const out: Record<string, T> = {};
  for (const doc of snap.docs) {
    out[doc.id] = doc.data() as T;
  }
  return out;
}

function stripRun(data: DocumentData | undefined): { run: Run; eventSeq: number } | null {
  if (!data) return null;
  const { eventSeq, ...rest } = data;
  return {
    run: rest as Run,
    eventSeq: typeof eventSeq === "number" ? eventSeq : 0,
  };
}

function stripSession(data: DocumentData | undefined): Session | null {
  if (!data) return null;
  const { dateTokyo, listedOnCalendar: _listed, calendarTitle: _title, ...rest } = data;
  void dateTokyo;
  return rest as Session;
}

function coupleMeta(data: DocumentData): { couple: Couple; runCountByDate: Record<string, number> } {
  const { runCountByDate, updatedAt, ...rest } = data;
  void updatedAt;
  return {
    couple: rest as Couple,
    runCountByDate: runCountByDate && typeof runCountByDate === "object" ? { ...(runCountByDate as Record<string, number>) } : {},
  };
}

function sessionDocPayload(bundle: SessionBundle) {
  return {
    ...bundle.session,
    dateTokyo: bundle.session.input.dateTokyo,
    listedOnCalendar: listedOnCalendar(bundle.session),
    calendarTitle: calendarTitle(bundle),
  };
}

function runDocPayload(run: Run, eventSeq: number) {
  return { ...run, eventSeq };
}

type Slice = {
  couple: CoupleBundle;
  sessionId: string | null;
  eventSeq: Record<string, number>;
  original: {
    memories: Set<string>;
    candidates: Set<string>;
    reflections: Set<string>;
    approvals: Set<string>;
    replays: Set<string>;
    runs: Set<string>;
    events: Set<string>;
    plans: Set<string>;
    spots: Set<string>;
    evidence: Set<string>;
    scenarios: Set<string>;
  };
};

function emptyOriginal(): Slice["original"] {
  return {
    memories: new Set(),
    candidates: new Set(),
    reflections: new Set(),
    approvals: new Set(),
    replays: new Set(),
    runs: new Set(),
    events: new Set(),
    plans: new Set(),
    spots: new Set(),
    evidence: new Set(),
    scenarios: new Set(),
  };
}

async function readLookup(kind: LookupKind, id: string, tx?: Tx): Promise<DocLocation | null> {
  const ref = lookupRef(db(), kind, id);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() as DocLocation;
  if (!data?.coupleId) return null;
  return data;
}

async function loadCoupleCollections(coupleId: string, tx?: Tx): Promise<CoupleBundle | null> {
  const firestore = db();
  const cref = coupleRef(firestore, coupleId);
  const snap = tx ? await tx.get(cref) : await cref.get();
  if (!snap.exists) return null;
  const meta = coupleMeta(snap.data() as DocumentData);
  const bundle = emptyCoupleBundle(meta.couple);
  bundle.runCountByDate = meta.runCountByDate;

  const cols = [
    cref.collection(sub("memories")),
    cref.collection(sub("memoryCandidates")),
    cref.collection(sub("reflections")),
    cref.collection(sub("approvals")),
    cref.collection(sub("replays")),
    cref.collection(sub("agentMemories")),
  ];
  const [memories, candidates, reflections, approvals, replays, agentMems] = await Promise.all(
    cols.map((colRef) => (tx ? tx.get(colRef) : colRef.get())),
  );
  bundle.memories = asRecord<Memory>(memories as FirebaseFirestore.QuerySnapshot);
  bundle.memoryCandidates = asRecord<MemoryCandidate>(candidates as FirebaseFirestore.QuerySnapshot);
  bundle.reflections = asRecord<Reflection>(reflections as FirebaseFirestore.QuerySnapshot);
  bundle.approvals = asRecord<Approval>(approvals as FirebaseFirestore.QuerySnapshot);
  bundle.replays = asRecord<ReplayManifest>(replays as FirebaseFirestore.QuerySnapshot);
  const memoriesByAgent: AgentMemories = {};
  for (const doc of (agentMems as FirebaseFirestore.QuerySnapshot).docs) {
    memoriesByAgent[doc.id as AgentId] = doc.data() as AgentMemory;
  }
  bundle.agentMemories = memoriesByAgent;
  return bundle;
}

async function loadSessionBundle(
  coupleId: string,
  sessionId: string,
  tx?: Tx,
): Promise<{ bundle: SessionBundle; eventSeq: Record<string, number> } | null> {
  const firestore = db();
  const sref = sessionRef(firestore, coupleId, sessionId);
  const snap = tx ? await tx.get(sref) : await sref.get();
  if (!snap.exists) return null;
  const session = stripSession(snap.data());
  if (!session) return null;
  const bundle = emptySessionBundle(session);
  const eventSeq: Record<string, number> = {};
  const [runs, events, plans, spots, evidence, scenarios] = await Promise.all(
    [
      sref.collection(sub("runs")),
      sref.collection(sub("events")),
      sref.collection(sub("planVersions")),
      sref.collection(sub("spots")),
      sref.collection(sub("evidence")),
      sref.collection(sub("scenarios")),
    ].map((colRef) => (tx ? tx.get(colRef) : colRef.get())),
  );
  for (const doc of (runs as FirebaseFirestore.QuerySnapshot).docs) {
    const parsed = stripRun(doc.data());
    if (!parsed) continue;
    bundle.runs[parsed.run.id] = parsed.run;
    eventSeq[parsed.run.id] = parsed.eventSeq;
  }
  bundle.events = asRecord<AppEvent>(events as FirebaseFirestore.QuerySnapshot);
  bundle.planHistory = asRecord<Plan>(plans as FirebaseFirestore.QuerySnapshot);
  bundle.spots = asRecord<Spot>(spots as FirebaseFirestore.QuerySnapshot);
  bundle.evidence = asRecord<Evidence>(evidence as FirebaseFirestore.QuerySnapshot);
  bundle.scenarios = asRecord<ScenarioOverlay>(scenarios as FirebaseFirestore.QuerySnapshot);
  return { bundle, eventSeq };
}

async function loadSlice(coupleId: string, sessionId: string | null, tx?: Tx): Promise<Slice | null> {
  const couple = await loadCoupleCollections(coupleId, tx);
  if (!couple) return null;
  const original = emptyOriginal();
  original.memories = new Set(Object.keys(couple.memories));
  original.candidates = new Set(Object.keys(couple.memoryCandidates));
  original.reflections = new Set(Object.keys(couple.reflections));
  original.approvals = new Set(Object.keys(couple.approvals));
  original.replays = new Set(Object.keys(couple.replays));
  let eventSeq: Record<string, number> = {};
  if (sessionId) {
    const loaded = await loadSessionBundle(coupleId, sessionId, tx);
    if (!loaded) return null;
    couple.sessions[sessionId] = loaded.bundle;
    eventSeq = loaded.eventSeq;
    original.runs = new Set(Object.keys(loaded.bundle.runs));
    original.events = new Set(Object.keys(loaded.bundle.events));
    original.plans = new Set(Object.keys(loaded.bundle.planHistory));
    original.spots = new Set(Object.keys(loaded.bundle.spots));
    original.evidence = new Set(Object.keys(loaded.bundle.evidence));
    original.scenarios = new Set(Object.keys(loaded.bundle.scenarios));
  }
  return { couple, sessionId, eventSeq, original };
}

function persistMap(
  tx: Tx,
  records: Record<string, unknown>,
  original: Set<string>,
  refOf: (id: string) => FirebaseFirestore.DocumentReference,
) {
  for (const [id, value] of Object.entries(records)) {
    tx.set(refOf(id), value as DocumentData);
  }
  for (const id of original) {
    if (!(id in records)) tx.delete(refOf(id));
  }
}

function persistSlice(tx: Tx, slice: Slice) {
  const firestore = db();
  const coupleId = slice.couple.couple.id;
  tx.set(coupleRef(firestore, coupleId), {
    ...slice.couple.couple,
    runCountByDate: slice.couple.runCountByDate ?? {},
    updatedAt: realNowIso(),
  });
  persistMap(tx, slice.couple.memories, slice.original.memories, (id) => memoryRef(firestore, coupleId, id));
  persistMap(tx, slice.couple.memoryCandidates, slice.original.candidates, (id) => candidateRef(firestore, coupleId, id));
  persistMap(tx, slice.couple.reflections, slice.original.reflections, (id) => reflectionRef(firestore, coupleId, id));
  persistMap(tx, slice.couple.approvals, slice.original.approvals, (id) => approvalRef(firestore, coupleId, id));
  persistMap(tx, slice.couple.replays, slice.original.replays, (id) => replayRef(firestore, coupleId, id));
  for (const [id, approval] of Object.entries(slice.couple.approvals)) {
    if (!slice.original.approvals.has(id)) {
      tx.set(lookupRef(firestore, "approval", id), { coupleId, sessionId: approval.sessionId });
    }
  }
  for (const [id, memory] of Object.entries(slice.couple.memories)) {
    if (!slice.original.memories.has(id)) {
      tx.set(lookupRef(firestore, "memory", id), { coupleId, sessionId: memory.targetSessionId ?? undefined });
    }
  }
  for (const [id, replay] of Object.entries(slice.couple.replays)) {
    if (!slice.original.replays.has(id)) {
      tx.set(lookupRef(firestore, "replay", id), { coupleId, sessionId: replay.sessionId });
    }
  }
  for (const id of AGENT_IDS) {
    const mem = slice.couple.agentMemories?.[id];
    if (mem) tx.set(agentMemoryRef(firestore, coupleId, id), mem as DocumentData);
  }
  if (!slice.sessionId) return;
  const bundle = slice.couple.sessions[slice.sessionId];
  if (!bundle) return;
  tx.set(sessionRef(firestore, coupleId, slice.sessionId), sessionDocPayload(bundle));
  tx.set(lookupRef(firestore, "session", slice.sessionId), { coupleId, sessionId: slice.sessionId });
  for (const [id, run] of Object.entries(bundle.runs)) {
    const seq =
      slice.eventSeq[id] ??
      Object.values(bundle.events)
        .filter((e) => e.runId === id)
        .reduce((n, e) => Math.max(n, e.seq + 1), 0);
    tx.set(runRef(firestore, coupleId, slice.sessionId, id), runDocPayload(run, seq));
    if (!slice.original.runs.has(id)) {
      tx.set(lookupRef(firestore, "run", id), { coupleId, sessionId: slice.sessionId });
    }
  }
  for (const id of slice.original.runs) {
    if (!(id in bundle.runs)) tx.delete(runRef(firestore, coupleId, slice.sessionId, id));
  }
  persistMap(tx, bundle.events, slice.original.events, (id) => eventRef(firestore, coupleId, slice.sessionId!, id));
  persistMap(tx, bundle.planHistory, slice.original.plans, (id) => planRef(firestore, coupleId, slice.sessionId!, id));
  persistMap(tx, bundle.spots, slice.original.spots, (id) => spotRef(firestore, coupleId, slice.sessionId!, id));
  persistMap(tx, bundle.evidence, slice.original.evidence, (id) => evidenceRef(firestore, coupleId, slice.sessionId!, id));
  persistMap(tx, bundle.scenarios, slice.original.scenarios, (id) => scenarioRef(firestore, coupleId, slice.sessionId!, id));
}

export async function putCouple(bundle: CoupleBundle): Promise<void> {
  const firestore = db();
  await firestore.runTransaction(async (tx) => {
    tx.set(coupleRef(firestore, bundle.couple.id), {
      ...bundle.couple,
      runCountByDate: bundle.runCountByDate ?? {},
      updatedAt: realNowIso(),
    });
  });
}

export async function loadCouple(coupleId: string): Promise<CoupleBundle | null> {
  return loadCoupleCollections(coupleId);
}

export async function withCouple<T>(
  coupleId: string,
  fn: (couple: CoupleBundle | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (!persist) {
    const couple = await loadCoupleCollections(coupleId);
    return fn(couple);
  }
  return withRetry(() =>
    db().runTransaction(async (tx) => {
      const slice = await loadSlice(coupleId, null, tx);
      const result = await fn(slice?.couple ?? null);
      if (slice) {
        const added = Object.keys(slice.couple.sessions)[0];
        if (!slice.sessionId && added) slice.sessionId = added;
        persistSlice(tx, slice);
      }
      return result;
    }),
  );
}

export async function withSession<T>(
  sessionId: string,
  fn: (found: FoundSession | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (!persist) {
    const loc = await readLookup("session", sessionId);
    if (!loc) return fn(null);
    const slice = await loadSlice(loc.coupleId, sessionId);
    if (!slice) return fn(null);
    return fn({ couple: slice.couple, bundle: slice.couple.sessions[sessionId] });
  }
  return withRetry(() =>
    db().runTransaction(async (tx) => {
      const loc = await readLookup("session", sessionId, tx);
      if (!loc) return fn(null);
      const slice = await loadSlice(loc.coupleId, sessionId, tx);
      if (!slice) return fn(null);
      const result = await fn({ couple: slice.couple, bundle: slice.couple.sessions[sessionId] });
      persistSlice(tx, slice);
      return result;
    }),
  );
}

export async function withRun<T>(
  runId: string,
  fn: (found: FoundRun | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  if (!persist) {
    const loc = await readLookup("run", runId);
    if (!loc?.sessionId) return fn(null);
    const slice = await loadSlice(loc.coupleId, loc.sessionId);
    const bundle = slice?.couple.sessions[loc.sessionId];
    const run = bundle?.runs[runId];
    if (!slice || !bundle || !run) return fn(null);
    return fn({ couple: slice.couple, bundle, run });
  }
  return withRetry(() =>
    db().runTransaction(async (tx) => {
      const loc = await readLookup("run", runId, tx);
      if (!loc?.sessionId) return fn(null);
      const slice = await loadSlice(loc.coupleId, loc.sessionId, tx);
      const bundle = slice?.couple.sessions[loc.sessionId];
      const run = bundle?.runs[runId];
      if (!slice || !bundle || !run) return fn(null);
      const result = await fn({ couple: slice.couple, bundle, run });
      persistSlice(tx, slice);
      return result;
    }),
  );
}

export async function withApproval<T>(
  approvalId: string,
  fn: (found: FoundApproval | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  return withRetry(() =>
    db().runTransaction(async (tx) => {
      const loc = await readLookup("approval", approvalId, tx);
      if (!loc) return fn(null);
      const slice = await loadSlice(loc.coupleId, loc.sessionId ?? null, tx);
      if (!slice) return fn(null);
      const approval = slice.couple.approvals[approvalId];
      if (!approval) return fn(null);
      const sessionId = loc.sessionId ?? approval.sessionId;
      if (sessionId && !slice.couple.sessions[sessionId]) {
        const loaded = await loadSessionBundle(loc.coupleId, sessionId, tx);
        if (loaded) {
          slice.couple.sessions[sessionId] = loaded.bundle;
          slice.sessionId = sessionId;
          slice.eventSeq = loaded.eventSeq;
          slice.original.runs = new Set(Object.keys(loaded.bundle.runs));
          slice.original.events = new Set(Object.keys(loaded.bundle.events));
          slice.original.plans = new Set(Object.keys(loaded.bundle.planHistory));
          slice.original.spots = new Set(Object.keys(loaded.bundle.spots));
          slice.original.evidence = new Set(Object.keys(loaded.bundle.evidence));
          slice.original.scenarios = new Set(Object.keys(loaded.bundle.scenarios));
        }
      }
      const result = await fn({ couple: slice.couple, approval });
      if (persist) persistSlice(tx, slice);
      return result;
    }),
  );
}

export async function withMemory<T>(
  memoryId: string,
  fn: (found: FoundMemory | null) => T | Promise<T>,
  persist = true,
): Promise<T> {
  return withRetry(() =>
    db().runTransaction(async (tx) => {
      const loc = await readLookup("memory", memoryId, tx);
      if (!loc) return fn(null);
      const slice = await loadSlice(loc.coupleId, null, tx);
      if (!slice) return fn(null);
      const memory = slice.couple.memories[memoryId];
      if (!memory) return fn(null);
      const result = await fn({ couple: slice.couple, memory });
      if (persist) persistSlice(tx, slice);
      return result;
    }),
  );
}

export async function getRun(runId: string): Promise<FoundRun | null> {
  return withRun(runId, (found) => found, false);
}

export async function getSession(sessionId: string): Promise<FoundSession | null> {
  return withSession(sessionId, (found) => found, false);
}

export async function createSessionDocs(coupleId: string, bundle: SessionBundle, memories: Record<string, Memory>) {
  const firestore = db();
  await withRetry(() =>
    firestore.runTransaction(async (tx) => {
      tx.set(sessionRef(firestore, coupleId, bundle.session.id), sessionDocPayload(bundle));
      tx.set(lookupRef(firestore, "session", bundle.session.id), { coupleId, sessionId: bundle.session.id });
      for (const memory of Object.values(memories)) {
        tx.set(memoryRef(firestore, coupleId, memory.id), memory);
      }
    }),
  );
}

export type InsertRunInput = {
  uid: string;
  sessionId: string;
  kind: Run["kind"];
  trigger?: string | null;
  instruction?: string | null;
  targetPlanItemId?: string | null;
  basePlanVersion?: number | null;
  idempotencyKey?: string | null;
  bodyHash: string;
  run: Run;
};

export async function insertPendingRun(input: InsertRunInput): Promise<
  | { ok: true; duplicated: true; runId: string }
  | { ok: true; duplicated: false; runId: string }
  | { ok: false; status: number; error: string }
> {
  const firestore = db();
  return withRetry(() =>
    firestore.runTransaction(async (tx) => {
      if (input.idempotencyKey) {
        const prevSnap = await tx.get(idempotencyRef(firestore, input.idempotencyKey));
        if (prevSnap.exists) {
          const prev = prevSnap.data() as IdempotencyRecord;
          if (prev.uid !== input.uid || prev.bodyHash !== input.bodyHash || prev.op !== "startRun") {
            return { ok: false as const, status: 409, error: "idempotency conflict" };
          }
          return { ok: true as const, duplicated: true as const, ...(prev.response as { runId: string }) };
        }
      }
      const loc = await readLookup("session", input.sessionId, tx);
      if (!loc) return { ok: false as const, status: 404, error: "session not found" };
      const coupleSnap = await tx.get(coupleRef(firestore, loc.coupleId));
      if (!coupleSnap.exists) return { ok: false as const, status: 404, error: "couple not found" };
      const meta = coupleMeta(coupleSnap.data() as DocumentData);
      if (meta.couple.ownerUid !== input.uid) return { ok: false as const, status: 403, error: "forbidden" };
      const sessionSnap = await tx.get(sessionRef(firestore, loc.coupleId, input.sessionId));
      if (!sessionSnap.exists) return { ok: false as const, status: 404, error: "session not found" };
      const session = stripSession(sessionSnap.data());
      if (!session) return { ok: false as const, status: 404, error: "session not found" };
      let currentItemIds: string[] | null = null;
      if (input.instruction != null && input.kind === "REPLAN" && session.currentPlanVersion != null) {
        const planSnap = await tx.get(planRef(firestore, loc.coupleId, input.sessionId, session.currentPlanVersion));
        const plan = planSnap.data() as Plan | undefined;
        currentItemIds = plan?.items?.map((item) => item.id) ?? [];
      }
      const replanError = replanStartError({
        kind: input.kind,
        instruction: input.instruction,
        basePlanVersion: input.basePlanVersion,
        currentPlanVersion: session.currentPlanVersion,
        targetPlanItemId: input.targetPlanItemId,
        currentItemIds,
      });
      if (replanError) return { ok: false as const, ...replanError };
      const runsSnap = await tx.get(sessionRef(firestore, loc.coupleId, input.sessionId).collection(sub("runs")));
      const active = (runsSnap as FirebaseFirestore.QuerySnapshot).docs
        .map((doc) => stripRun(doc.data())?.run)
        .filter((run): run is Run => Boolean(run))
        .filter((r) => ["PENDING", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL"].includes(r.status));
      if (active.length >= 1 && input.kind !== "REFLECTION" && input.kind !== "PRICE_ENRICH") {
        return {
          ok: false as const,
          status: 409,
          error: `concurrent run: ${active.map((r) => `${r.id}:${r.status}:${r.kind}`).join(",")}`,
        };
      }
      const today = realNowIso().slice(0, 10);
      const countToday = meta.runCountByDate[today] ?? 0;
      if (countToday >= 20) return { ok: false as const, status: 429, error: "daily cap" };
      const run = {
        ...input.run,
        coupleId: loc.coupleId,
        sessionId: input.sessionId,
        ownerUid: input.uid,
        instruction: input.instruction ?? input.run.instruction ?? null,
        targetPlanItemId: input.targetPlanItemId ?? input.run.targetPlanItemId ?? null,
        basePlanVersion: session.currentPlanVersion,
      };
      tx.set(runRef(firestore, loc.coupleId, input.sessionId, run.id), runDocPayload(run, 0));
      tx.set(lookupRef(firestore, "run", run.id), { coupleId: loc.coupleId, sessionId: input.sessionId });
      tx.set(coupleRef(firestore, loc.coupleId), {
        ...meta.couple,
        runCountByDate: { ...meta.runCountByDate, [today]: countToday + 1 },
        updatedAt: realNowIso(),
      });
      if (input.idempotencyKey) {
        tx.set(idempotencyRef(firestore, input.idempotencyKey), {
          key: input.idempotencyKey,
          uid: input.uid,
          target: input.sessionId,
          op: "startRun",
          bodyHash: input.bodyHash,
          status: 202,
          response: { runId: run.id },
        });
      }
      return { ok: true as const, duplicated: false as const, runId: run.id };
    }),
  );
}

export async function appendRunEvent(runId: string, event: AppEvent): Promise<void> {
  const firestore = db();
  await withRetry(() =>
    firestore.runTransaction(async (tx) => {
      const loc = await readLookup("run", runId, tx);
      if (!loc?.sessionId) return;
      const rref = runRef(firestore, loc.coupleId, loc.sessionId, runId);
      const snap = await tx.get(rref);
      const parsed = stripRun(snap.data());
      if (!parsed) return;
      const seq = Math.max(parsed.eventSeq, event.seq);
      tx.set(eventRef(firestore, loc.coupleId, loc.sessionId, event.eventId), { ...event, seq });
      tx.set(rref, runDocPayload(parsed.run, seq + 1));
    }),
  );
}

export async function patchRunDoc(runId: string, patch: Partial<Run>): Promise<void> {
  const firestore = db();
  await withRetry(() =>
    firestore.runTransaction(async (tx) => {
      const loc = await readLookup("run", runId, tx);
      if (!loc?.sessionId) return;
      const rref = runRef(firestore, loc.coupleId, loc.sessionId, runId);
      const snap = await tx.get(rref);
      const parsed = stripRun(snap.data());
      if (!parsed) return;
      Object.assign(parsed.run, patch);
      tx.set(rref, runDocPayload(parsed.run, parsed.eventSeq));
    }),
  );
}

export async function claimRunDoc(runId: string, owner: string, leaseMs: number): Promise<boolean> {
  const firestore = db();
  return withRetry(() =>
    firestore.runTransaction(async (tx) => {
      const loc = await readLookup("run", runId, tx);
      if (!loc?.sessionId) return false;
      const rref = runRef(firestore, loc.coupleId, loc.sessionId, runId);
      const snap = await tx.get(rref);
      const parsed = stripRun(snap.data());
      if (!parsed) return false;
      const now = Date.now();
      const run = parsed.run;
      if (run.status === "RUNNING") {
        if (run.leaseOwner === owner) {
          run.heartbeatAt = realNowIso();
          run.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
          tx.set(rref, runDocPayload(run, parsed.eventSeq));
          return true;
        }
        if (run.leaseExpiresAt && new Date(run.leaseExpiresAt).getTime() > now) return false;
      } else if (run.status !== "PENDING") {
        return false;
      }
      run.status = "RUNNING";
      run.startedAt = run.startedAt ?? realNowIso();
      run.leaseOwner = owner;
      run.heartbeatAt = realNowIso();
      run.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
      tx.set(rref, runDocPayload(run, parsed.eventSeq));
      return true;
    }),
  );
}

export async function heartbeatDoc(runId: string, leaseMs: number): Promise<boolean> {
  const firestore = db();
  return withRetry(() =>
    firestore.runTransaction(async (tx) => {
      const loc = await readLookup("run", runId, tx);
      if (!loc?.sessionId) return false;
      const rref = runRef(firestore, loc.coupleId, loc.sessionId, runId);
      const snap = await tx.get(rref);
      const parsed = stripRun(snap.data());
      if (!parsed?.run.leaseOwner) return false;
      parsed.run.heartbeatAt = realNowIso();
      parsed.run.leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
      tx.set(rref, runDocPayload(parsed.run, parsed.eventSeq));
      return true;
    }),
  );
}

export async function expireAndClaimPending(workerId: string, leaseMs: number, newEvent: (runId: string, seq: number) => AppEvent): Promise<string | null> {
  const firestore = db();
  const now = Date.now();
  const running = await firestore.collectionGroup(sub("runs")).where("status", "==", "RUNNING").limit(50).get();
  for (const doc of running.docs) {
    const parsed = stripRun(doc.data());
    if (!parsed?.run.leaseExpiresAt) continue;
    if (new Date(parsed.run.leaseExpiresAt).getTime() >= now) continue;
    const loc = await readLookup("run", parsed.run.id);
    if (!loc?.sessionId) continue;
    await withRetry(() =>
      firestore.runTransaction(async (tx) => {
        const rref = runRef(firestore, loc.coupleId, loc.sessionId!, parsed.run.id);
        const snap = await tx.get(rref);
        const current = stripRun(snap.data());
        if (!current || current.run.status !== "RUNNING") return;
        if (!current.run.leaseExpiresAt || new Date(current.run.leaseExpiresAt).getTime() >= Date.now()) return;
        current.run.status = "INTERRUPTED";
        current.run.leaseOwner = null;
        current.run.error = "lease expired; not restarted from scratch";
        current.run.finishedAt = realNowIso();
        const event = newEvent(current.run.id, current.eventSeq);
        tx.set(rref, runDocPayload(current.run, current.eventSeq + 1));
        tx.set(eventRef(firestore, loc.coupleId, loc.sessionId!, event.eventId), event);
      }),
    );
  }

  let pending: FirebaseFirestore.QuerySnapshot;
  try {
    pending = await firestore
      .collectionGroup(sub("runs"))
      .where("status", "==", "PENDING")
      .orderBy("createdAt", "asc")
      .limit(8)
      .get();
  } catch {
    pending = await firestore.collectionGroup(sub("runs")).where("status", "==", "PENDING").limit(20).get();
  }
  for (const doc of pending.docs) {
    const parsed = stripRun(doc.data());
    if (!parsed) continue;
    const claimed = await claimRunDoc(parsed.run.id, workerId, leaseMs);
    if (claimed) return parsed.run.id;
  }
  return null;
}

export async function listCalendarPlansDocs(
  uid: string,
  coupleId: string,
  range: { from?: string | null; to?: string | null },
) {
  const firestore = db();
  const coupleSnap = await coupleRef(firestore, coupleId).get();
  if (!coupleSnap.exists) return { ok: false as const, status: 404, error: "couple not found" };
  const meta = coupleMeta(coupleSnap.data() as DocumentData);
  if (meta.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
  let query: FirebaseFirestore.Query = coupleRef(firestore, coupleId).collection(sub("sessions"));
  if (range.from) query = query.where("dateTokyo", ">=", range.from);
  if (range.to) query = query.where("dateTokyo", "<=", range.to);
  query = query.orderBy("dateTokyo", "asc");
  const snap = await query.get();
  const plans = snap.docs
    .map((doc) => {
      const data = doc.data();
      const session = stripSession(data);
      if (!session || !listedOnCalendar(session)) return null;
      return {
        id: session.id,
        date: session.input.dateTokyo,
        startTime: session.input.startTime,
        endTime: session.input.endTime,
        status: session.status,
        title: typeof data.calendarTitle === "string" ? data.calendarTitle : `${session.input.meet.name}のプラン`,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  return { ok: true as const, plans };
}

export async function ownerCoupleIdDoc(uid: string): Promise<string | null> {
  const snap = await db().collection(coupleCol()).where("ownerUid", "==", uid).limit(1).get();
  return snap.docs[0]?.id ?? null;
}

export async function getReplayDoc(uid: string, replayId: string): Promise<{ coupleId: string; replay: ReplayManifest } | null> {
  const loc = await readLookup("replay", replayId);
  if (!loc) return null;
  const couple = await loadCoupleCollections(loc.coupleId);
  if (!couple || couple.couple.ownerUid !== uid) return null;
  const replay = couple.replays[replayId];
  if (!replay) return null;
  return { coupleId: loc.coupleId, replay };
}

export async function demoResetDocs(uid: string, keepReplays: boolean): Promise<void> {
  const firestore = db();
  const couples = await firestore.collection(coupleCol()).where("ownerUid", "==", uid).where("isDemo", "==", true).get();
  for (const coupleDoc of couples.docs) {
    const coupleId = coupleDoc.id;
    const sessions = await coupleRef(firestore, coupleId).collection(sub("sessions")).get();
    for (const sessionDoc of sessions.docs) {
      for (const name of ["runs", "events", "planVersions", "spots", "evidence", "scenarios"]) {
        const colSnap = await sessionDoc.ref.collection(sub(name)).get();
        const batch = firestore.batch();
        for (const child of colSnap.docs) batch.delete(child.ref);
        if (!colSnap.empty) await batch.commit();
      }
      const loc = lookupRef(firestore, "session", sessionDoc.id);
      await Promise.all([sessionDoc.ref.delete(), loc.delete()]);
    }
    for (const name of ["memories", "memoryCandidates", "reflections", "approvals", ...(keepReplays ? [] : ["replays"]), "agentMemories"]) {
      const colSnap = await coupleRef(firestore, coupleId).collection(sub(name)).get();
      const batch = firestore.batch();
      for (const child of colSnap.docs) {
        batch.delete(child.ref);
        if (name === "memories") batch.delete(lookupRef(firestore, "memory", child.id));
        if (name === "approvals") batch.delete(lookupRef(firestore, "approval", child.id));
        if (name === "replays") batch.delete(lookupRef(firestore, "replay", child.id));
      }
      if (!colSnap.empty) await batch.commit();
    }
  }
}

export async function writeSplitFromDb(
  source: Db,
  opts: { ifMissing?: boolean } = {},
): Promise<{ counts: SplitCounts; written: number; skipped: number }> {
  const firestore = db();
  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: DocumentData }> = [];
  for (const couple of Object.values(source.couples)) {
    const coupleId = couple.couple.id;
    writes.push({
      ref: coupleRef(firestore, coupleId),
      data: { ...couple.couple, runCountByDate: couple.runCountByDate ?? {}, updatedAt: realNowIso() },
    });
    for (const [id, memory] of Object.entries(couple.memories)) {
      writes.push({ ref: memoryRef(firestore, coupleId, id), data: memory });
      writes.push({ ref: lookupRef(firestore, "memory", id), data: { coupleId, sessionId: memory.targetSessionId ?? undefined } });
    }
    for (const [id, candidate] of Object.entries(couple.memoryCandidates)) {
      writes.push({ ref: candidateRef(firestore, coupleId, id), data: candidate });
    }
    for (const [id, reflection] of Object.entries(couple.reflections)) {
      writes.push({ ref: reflectionRef(firestore, coupleId, id), data: reflection });
    }
    for (const [id, approval] of Object.entries(couple.approvals)) {
      writes.push({ ref: approvalRef(firestore, coupleId, id), data: approval });
      writes.push({ ref: lookupRef(firestore, "approval", id), data: { coupleId, sessionId: approval.sessionId } });
    }
    for (const [id, replay] of Object.entries(couple.replays)) {
      writes.push({ ref: replayRef(firestore, coupleId, id), data: replay });
      writes.push({ ref: lookupRef(firestore, "replay", id), data: { coupleId, sessionId: replay.sessionId } });
    }
    for (const id of AGENT_IDS) {
      const mem = couple.agentMemories?.[id];
      if (mem) writes.push({ ref: agentMemoryRef(firestore, coupleId, id), data: mem as DocumentData });
    }
    for (const bundle of Object.values(couple.sessions)) {
      const sessionId = bundle.session.id;
      writes.push({ ref: sessionRef(firestore, coupleId, sessionId), data: sessionDocPayload(bundle) });
      writes.push({ ref: lookupRef(firestore, "session", sessionId), data: { coupleId, sessionId } });
      for (const run of Object.values(bundle.runs)) {
        const seq = Object.values(bundle.events)
          .filter((e) => e.runId === run.id)
          .reduce((n, e) => Math.max(n, e.seq + 1), 0);
        writes.push({ ref: runRef(firestore, coupleId, sessionId, run.id), data: runDocPayload(run, seq) });
        writes.push({ ref: lookupRef(firestore, "run", run.id), data: { coupleId, sessionId } });
      }
      for (const event of Object.values(bundle.events)) {
        writes.push({ ref: eventRef(firestore, coupleId, sessionId, event.eventId), data: event });
      }
      for (const [version, plan] of Object.entries(bundle.planHistory)) {
        writes.push({ ref: planRef(firestore, coupleId, sessionId, version), data: plan });
      }
      for (const [id, spot] of Object.entries(bundle.spots)) {
        writes.push({ ref: spotRef(firestore, coupleId, sessionId, id), data: spot });
      }
      for (const [id, evidence] of Object.entries(bundle.evidence)) {
        writes.push({ ref: evidenceRef(firestore, coupleId, sessionId, id), data: evidence });
      }
      for (const [id, scenario] of Object.entries(bundle.scenarios)) {
        writes.push({ ref: scenarioRef(firestore, coupleId, sessionId, id), data: scenario });
      }
    }
  }
  for (const rec of Object.values(source.idempotency)) {
    writes.push({ ref: idempotencyRef(firestore, rec.key), data: rec });
  }

  let written = 0;
  let skipped = 0;
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    if (opts.ifMissing) {
      for (let j = 0; j < chunk.length; j += 100) {
        const slice = chunk.slice(j, j + 100);
        const snaps = await firestore.getAll(...slice.map((item) => item.ref));
        const batch = firestore.batch();
        let used = 0;
        snaps.forEach((snap, index) => {
          if (snap.exists) {
            skipped += 1;
            return;
          }
          batch.set(slice[index].ref, slice[index].data);
          used += 1;
          written += 1;
        });
        if (used) await batch.commit();
      }
    } else {
      const batch = firestore.batch();
      for (const item of chunk) batch.set(item.ref, item.data);
      await batch.commit();
      written += chunk.length;
    }
  }
  return { counts: splitCounts(source), written, skipped };
}

export async function listSplitInventory(): Promise<{
  couples: string[];
  sessions: string[];
  runs: string[];
  events: number;
  planVersions: number;
}> {
  const firestore = db();
  const couplesSnap = await firestore.collection(coupleCol()).get();
  const couples: string[] = [];
  const sessions: string[] = [];
  const runs: string[] = [];
  let events = 0;
  let planVersions = 0;
  for (const coupleDoc of couplesSnap.docs) {
    couples.push(coupleDoc.id);
    const sessionSnap = await coupleDoc.ref.collection(sub("sessions")).get();
    for (const sessionDoc of sessionSnap.docs) {
      sessions.push(sessionDoc.id);
      const [runSnap, eventSnap, planSnap] = await Promise.all([
        sessionDoc.ref.collection(sub("runs")).select().get(),
        sessionDoc.ref.collection(sub("events")).select().get(),
        sessionDoc.ref.collection(sub("planVersions")).select().get(),
      ]);
      for (const runDoc of runSnap.docs) runs.push(runDoc.id);
      events += eventSnap.size;
      planVersions += planSnap.size;
    }
  }
  return { couples, sessions, runs, events, planVersions };
}

export async function nextEventSeq(bundle: SessionBundle, runId: string, eventSeq: Record<string, number>): Promise<number> {
  const fromField = eventSeq[runId];
  const fromEvents = Object.values(bundle.events)
    .filter((e) => e.runId === runId)
    .reduce((n, e) => Math.max(n, e.seq + 1), 0);
  const seq = Math.max(fromField ?? 0, fromEvents, Object.keys(bundle.events).length);
  eventSeq[runId] = seq + 1;
  return seq;
}
