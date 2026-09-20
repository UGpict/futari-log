import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { getEnv } from "@/config/env";
import { adminDb } from "@/server/firebase/admin";
import type { ConfirmationStatus } from "@/contracts/catalog";
import type { CatalogFieldEvidence, CatalogImage } from "@/contracts/catalog";

export type CatalogEventRecord = {
  id: string;
  title: string;
  genre: string;
  venueId: string | null;
  venueName: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  timeStart: string | null;
  timeEnd: string | null;
  feeText: string | null;
  officialUrl: string | null;
  lat: number | null;
  lng: number | null;
  confirmation: ConfirmationStatus;
  sourceUrl: string | null;
  sourceTitle: string | null;
  fetchedAt: string;
  planEligible: boolean;
  fields: {
    title: CatalogFieldEvidence;
    periodStart: CatalogFieldEvidence;
    periodEnd: CatalogFieldEvidence;
    hours: CatalogFieldEvidence;
    fridayClose: CatalogFieldEvidence;
    closedDays: CatalogFieldEvidence;
    venue: CatalogFieldEvidence;
    fee: CatalogFieldEvidence;
  };
  eventImage: CatalogImage | null;
  areaName: string;
  ingestRunId: string;
  fingerprint: string;
};

export type CatalogVenueRecord = {
  id: string;
  name: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  types: string[];
  websiteUri: string | null;
  googleMapsUri: string | null;
  regularOpeningHours: unknown | null;
  hoursFetchedAt: string | null;
  venuePhoto: CatalogImage | null;
  fetchedAt: string;
  confirmation: ConfirmationStatus;
};

export type CatalogIngestRunRecord = {
  id: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  startedAt: string;
  finishedAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  attempt: number;
  query: string;
  areaName: string;
  dateTokyo: string;
  genre: string;
  saved: number;
  error: string | null;
  search: {
    requestedModel: string;
    actualModel: string;
    path: string;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    costUsd: number | null;
    costJpy: number | null;
    citationCount: number;
    grounded: boolean;
    orcaRequestId: string | null;
    costSource: "settled" | "inline" | "missing" | null;
  } | null;
  structure: {
    requestedModel: string;
    actualModel: string;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    costUsd: number | null;
    costJpy: number | null;
    ok: boolean;
  } | null;
};

type CatalogDb = {
  events: Record<string, CatalogEventRecord>;
  venues: Record<string, CatalogVenueRecord>;
  ingestRuns: Record<string, CatalogIngestRunRecord>;
  lock: { owner: string; expiresAt: string; runId: string } | null;
};

const FILE = join(process.cwd(), ".data", "catalog.json");
const EVENTS = "catalogEvents";
const VENUES = "catalogVenues";
const RUNS = "catalogIngestRuns";
const LOCK_ID = "_lock";

function emptyDb(): CatalogDb {
  return { events: {}, venues: {}, ingestRuns: {}, lock: null };
}

function readFileDb(): CatalogDb {
  if (!existsSync(FILE)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as CatalogDb;
    return {
      events: parsed.events ?? {},
      venues: parsed.venues ?? {},
      ingestRuns: parsed.ingestRuns ?? {},
      lock: parsed.lock ?? null,
    };
  } catch {
    return emptyDb();
  }
}

function writeFileDb(db: CatalogDb) {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, FILE);
}

function useFirestore(): boolean {
  return getEnv().dataBackend === "firestore";
}

export async function saveVenue(venue: CatalogVenueRecord): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(VENUES).doc(venue.id).set(venue);
    return;
  }
  const db = readFileDb();
  db.venues[venue.id] = venue;
  writeFileDb(db);
}

export async function saveEvent(event: CatalogEventRecord): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(EVENTS).doc(event.id).set(event);
    return;
  }
  const db = readFileDb();
  db.events[event.id] = event;
  writeFileDb(db);
}

export async function saveIngestRun(run: CatalogIngestRunRecord): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(RUNS).doc(run.id).set(run);
    return;
  }
  const db = readFileDb();
  db.ingestRuns[run.id] = run;
  writeFileDb(db);
}

export async function getEvent(id: string): Promise<CatalogEventRecord | null> {
  if (useFirestore()) {
    const snap = await adminDb().collection(EVENTS).doc(id).get();
    return snap.exists ? (snap.data() as CatalogEventRecord) : null;
  }
  return readFileDb().events[id] ?? null;
}

export async function getVenue(id: string): Promise<CatalogVenueRecord | null> {
  if (useFirestore()) {
    const snap = await adminDb().collection(VENUES).doc(id).get();
    return snap.exists ? (snap.data() as CatalogVenueRecord) : null;
  }
  return readFileDb().venues[id] ?? null;
}

export async function listEvents(filter: {
  dateTokyo?: string;
  genre?: string;
  areaName?: string;
}): Promise<CatalogEventRecord[]> {
  if (useFirestore()) {
    const snap = await adminDb().collection(EVENTS).limit(80).get();
    return snap.docs.map((d) => d.data() as CatalogEventRecord).filter((e) => matchEvent(e, filter));
  }
  return Object.values(readFileDb().events).filter((e) => matchEvent(e, filter));
}

export async function latestIngestRun(): Promise<CatalogIngestRunRecord | null> {
  const runs = useFirestore()
    ? (await adminDb().collection(RUNS).limit(40).get()).docs
        .map((d) => d.data() as CatalogIngestRunRecord)
        .filter((r) => r.id !== LOCK_ID)
    : Object.values(readFileDb().ingestRuns);
  return (
    [...runs].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0] ?? null
  );
}

function matchEvent(
  event: CatalogEventRecord,
  filter: { dateTokyo?: string; genre?: string; areaName?: string },
): boolean {
  if (filter.genre && event.genre !== filter.genre) return false;
  if (filter.areaName && event.areaName !== filter.areaName) return false;
  if (filter.dateTokyo) {
    const start = event.dateStart ?? "9999-99-99";
    const end = event.dateEnd ?? event.dateStart ?? "0000-00-00";
    if (filter.dateTokyo < start || filter.dateTokyo > end) return false;
  }
  return true;
}

export async function findEventByFingerprint(fingerprint: string): Promise<CatalogEventRecord | null> {
  if (useFirestore()) {
    const snap = await adminDb().collection(EVENTS).where("fingerprint", "==", fingerprint).limit(1).get();
    return snap.empty ? null : (snap.docs[0].data() as CatalogEventRecord);
  }
  return Object.values(readFileDb().events).find((e) => e.fingerprint === fingerprint) ?? null;
}

export async function tryAcquireIngestLock(input: {
  owner: string;
  runId: string;
  leaseMs: number;
}): Promise<{ ok: true } | { ok: false; reason: string; runId: string | null }> {
  const now = Date.now();
  const expiresAt = new Date(now + input.leaseMs).toISOString();
  if (useFirestore()) {
    const ref = adminDb().collection(RUNS).doc(LOCK_ID);
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.data() as { owner?: string; expiresAt?: string; runId?: string } | undefined;
      if (current?.expiresAt && new Date(current.expiresAt).getTime() > now) {
        return { ok: false as const, reason: "lock held", runId: current.runId ?? null };
      }
      tx.set(ref, { owner: input.owner, expiresAt, runId: input.runId, kind: "lock" });
      return { ok: true as const };
    });
  }
  const db = readFileDb();
  if (db.lock && new Date(db.lock.expiresAt).getTime() > now) {
    return { ok: false, reason: "lock held", runId: db.lock.runId };
  }
  db.lock = { owner: input.owner, expiresAt, runId: input.runId };
  writeFileDb(db);
  return { ok: true };
}

export async function releaseIngestLock(runId: string): Promise<void> {
  if (useFirestore()) {
    const ref = adminDb().collection(RUNS).doc(LOCK_ID);
    const snap = await ref.get();
    if (snap.data()?.runId === runId) await ref.delete();
    return;
  }
  const db = readFileDb();
  if (db.lock?.runId === runId) {
    db.lock = null;
    writeFileDb(db);
  }
}
