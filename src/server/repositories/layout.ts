import type { Firestore } from "firebase-admin/firestore";

export function firestoreNamespace(): string {
  const raw = process.env.FIRESTORE_NAMESPACE?.trim() ?? "";
  if (!raw) return "";
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(raw)) {
    throw new Error("FIRESTORE_NAMESPACE must match /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/");
  }
  return raw;
}

export function col(name: string): string {
  const ns = firestoreNamespace();
  return ns ? `${ns}_${name}` : name;
}

export const CATALOG_COLLECTIONS = {
  events: "catalogEvents",
  venues: "catalogVenues",
  ingestRuns: "catalogIngestRuns",
} as const;

export const LEGACY_ROOT_DOC = process.env.FIRESTORE_ROOT_DOC?.trim() || "sys/root";

export function coupleCol() {
  return col("couples");
}
export function lookupsCol() {
  return col("lookups");
}
export function idempotencyCol() {
  return col("idempotency");
}

export function sub(name: string) {
  return col(name);
}

export type LookupKind = "session" | "run" | "approval" | "memory" | "replay";

export type DocLocation = {
  coupleId: string;
  sessionId?: string;
};

export function lookupDocId(kind: LookupKind, id: string) {
  return `${kind}:${id}`;
}

export function coupleRef(db: Firestore, coupleId: string) {
  return db.collection(coupleCol()).doc(coupleId);
}

export function sessionRef(db: Firestore, coupleId: string, sessionId: string) {
  return coupleRef(db, coupleId).collection(sub("sessions")).doc(sessionId);
}

export function runRef(db: Firestore, coupleId: string, sessionId: string, runId: string) {
  return sessionRef(db, coupleId, sessionId).collection(sub("runs")).doc(runId);
}

export function eventRef(db: Firestore, coupleId: string, sessionId: string, eventId: string) {
  return sessionRef(db, coupleId, sessionId).collection(sub("events")).doc(eventId);
}

export function planRef(db: Firestore, coupleId: string, sessionId: string, version: string | number) {
  return sessionRef(db, coupleId, sessionId).collection(sub("planVersions")).doc(String(version));
}

export function spotRef(db: Firestore, coupleId: string, sessionId: string, spotId: string) {
  return sessionRef(db, coupleId, sessionId).collection(sub("spots")).doc(spotId);
}

export function evidenceRef(db: Firestore, coupleId: string, sessionId: string, evidenceId: string) {
  return sessionRef(db, coupleId, sessionId).collection(sub("evidence")).doc(evidenceId);
}

export function scenarioRef(db: Firestore, coupleId: string, sessionId: string, scenarioId: string) {
  return sessionRef(db, coupleId, sessionId).collection(sub("scenarios")).doc(scenarioId);
}

export function memoryRef(db: Firestore, coupleId: string, memoryId: string) {
  return coupleRef(db, coupleId).collection(sub("memories")).doc(memoryId);
}

export function candidateRef(db: Firestore, coupleId: string, candidateId: string) {
  return coupleRef(db, coupleId).collection(sub("memoryCandidates")).doc(candidateId);
}

export function reflectionRef(db: Firestore, coupleId: string, reflectionId: string) {
  return coupleRef(db, coupleId).collection(sub("reflections")).doc(reflectionId);
}

export function approvalRef(db: Firestore, coupleId: string, approvalId: string) {
  return coupleRef(db, coupleId).collection(sub("approvals")).doc(approvalId);
}

export function replayRef(db: Firestore, coupleId: string, replayId: string) {
  return coupleRef(db, coupleId).collection(sub("replays")).doc(replayId);
}

export function agentMemoryRef(db: Firestore, coupleId: string, agentId: string) {
  return coupleRef(db, coupleId).collection(sub("agentMemories")).doc(agentId);
}

export function lookupRef(db: Firestore, kind: LookupKind, id: string) {
  return db.collection(lookupsCol()).doc(lookupDocId(kind, id));
}

export function idempotencyRef(db: Firestore, key: string) {
  return db.collection(idempotencyCol()).doc(key);
}
