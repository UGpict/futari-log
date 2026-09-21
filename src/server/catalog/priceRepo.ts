import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "@/config/env";
import { LIMITS } from "@/config/settings";
import type { OfficialPriceFact, PriceEnrichRun, PriceEvidence } from "@/contracts/price";
import { adminDb } from "@/server/firebase/admin";
import { CATALOG_COLLECTIONS, col } from "@/server/repositories/layout";

const FACTS = "spotPriceFacts";
const EVIDENCE = "spotPriceEvidence";
const RUNS = "spotPriceEnrichRuns";
const LOCKS = "spotPriceEnrichLocks";
const DAILY = "spotPriceEnrichDaily";

type FileDb = {
  facts: Record<string, OfficialPriceFact>;
  evidence: Record<string, PriceEvidence>;
  runs: Record<string, PriceEnrichRun>;
  locks: Record<string, { owner: string; expiresAt: string }>;
  daily: Record<string, { runs: number; costUsd: number }>;
};

function useFirestore(): boolean {
  return getEnv().dataBackend === "firestore";
}

function filePath(): string {
  return join(process.cwd(), ".data", "spot-prices.json");
}

function emptyDb(): FileDb {
  return { facts: {}, evidence: {}, runs: {}, locks: {}, daily: {} };
}

function readFileDb(): FileDb {
  const path = filePath();
  if (!existsSync(path)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FileDb>;
    return {
      facts: parsed.facts ?? {},
      evidence: parsed.evidence ?? {},
      runs: parsed.runs ?? {},
      locks: parsed.locks ?? {},
      daily: parsed.daily ?? {},
    };
  } catch {
    return emptyDb();
  }
}

function writeFileDb(db: FileDb): void {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

export function spotPriceCollections() {
  return {
    facts: col(FACTS),
    evidence: col(EVIDENCE),
    runs: col(RUNS),
    locks: col(LOCKS),
    catalog: CATALOG_COLLECTIONS,
  };
}

export async function listFactsForPlace(placeId: string): Promise<OfficialPriceFact[]> {
  if (useFirestore()) {
    const snap = await adminDb().collection(col(FACTS)).where("placeId", "==", placeId).get();
    return snap.docs.map((d) => d.data() as OfficialPriceFact);
  }
  return Object.values(readFileDb().facts).filter((f) => f.placeId === placeId);
}

export async function saveFact(fact: OfficialPriceFact): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(col(FACTS)).doc(fact.id).set(fact, { merge: true });
    return;
  }
  const db = readFileDb();
  db.facts[fact.id] = fact;
  writeFileDb(db);
}

export async function saveEvidence(ev: PriceEvidence): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(col(EVIDENCE)).doc(ev.id).set(ev, { merge: true });
    return;
  }
  const db = readFileDb();
  db.evidence[ev.id] = ev;
  writeFileDb(db);
}

export async function saveEnrichRun(run: PriceEnrichRun): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(col(RUNS)).doc(run.id).set(run, { merge: true });
    return;
  }
  const db = readFileDb();
  db.runs[run.id] = run;
  writeFileDb(db);
}

export async function getEnrichRun(runId: string): Promise<PriceEnrichRun | null> {
  if (useFirestore()) {
    const snap = await adminDb().collection(col(RUNS)).doc(runId).get();
    return snap.exists ? (snap.data() as PriceEnrichRun) : null;
  }
  return readFileDb().runs[runId] ?? null;
}

/** 同一 placeId の実行中ロック。取得失敗でも既存 facts は消さない。 */
export async function tryAcquirePriceLock(
  placeId: string,
  owner: string,
  ttlMs = 10 * 60_000,
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  if (useFirestore()) {
    const ref = adminDb().collection(col(LOCKS)).doc(placeId);
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = new Date().toISOString();
      if (snap.exists) {
        const data = snap.data() as { owner: string; expiresAt: string };
        if (data.expiresAt > now && data.owner !== owner) return false;
      }
      tx.set(ref, { owner, expiresAt, placeId });
      return true;
    });
  }
  const db = readFileDb();
  const now = new Date().toISOString();
  const existing = db.locks[placeId];
  if (existing && existing.expiresAt > now && existing.owner !== owner) return false;
  db.locks[placeId] = { owner, expiresAt };
  writeFileDb(db);
  return true;
}

export async function releasePriceLock(placeId: string, owner: string): Promise<void> {
  if (useFirestore()) {
    const ref = adminDb().collection(col(LOCKS)).doc(placeId);
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data() as { owner: string };
      if (data.owner === owner) tx.delete(ref);
    });
    return;
  }
  const db = readFileDb();
  if (db.locks[placeId]?.owner === owner) {
    delete db.locks[placeId];
    writeFileDb(db);
  }
}

function hashKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

/**
 * 金額・quote を含まない旧 ID（PR #25 初回コミット以前）。
 * カンマ欠け・誤 VERIFIED などが残りうるので会計には使わない。
 */
export function legacyStableFactId(parts: {
  placeId: string;
  kind: string;
  unit: string;
  audience: string;
  usageKind: string;
  sourceUrl: string | null;
}): string {
  const key = [parts.placeId, parts.kind, parts.unit, parts.audience, parts.usageKind, parts.sourceUrl ?? ""].join("|");
  return `pf_${hashKey(key)}_${parts.placeId.slice(0, 8)}`;
}

/** 同一内容の fact が増殖しないよう、placeId+kind+unit+audience+usage+sourceUrl+金額+quote で安定 ID。 */
export function stableFactId(parts: {
  placeId: string;
  kind: string;
  unit: string;
  audience: string;
  usageKind: string;
  sourceUrl: string | null;
  amountMinJpy?: number | null;
  quote?: string | null;
}): string {
  const quoteKey = (parts.quote ?? "").replace(/\s+/g, "").slice(0, 48);
  const key = [
    parts.placeId,
    parts.kind,
    parts.unit,
    parts.audience,
    parts.usageKind,
    parts.sourceUrl ?? "",
    parts.amountMinJpy ?? "",
    quoteKey,
  ].join("|");
  return `pf_${hashKey(key)}_${parts.placeId.slice(0, 8)}`;
}

/** 旧 ID 形式で保存された fact（金額なしキー）なら true。 */
export function isLegacyPriceFact(fact: Pick<OfficialPriceFact, "id" | "placeId" | "kind" | "unit" | "audience" | "usageKind" | "sourceUrl" | "amountMinJpy" | "quote">): boolean {
  const legacyId = legacyStableFactId({
    placeId: fact.placeId,
    kind: fact.kind,
    unit: fact.unit,
    audience: fact.audience,
    usageKind: fact.usageKind,
    sourceUrl: fact.sourceUrl,
  });
  if (fact.id !== legacyId) return false;
  const currentId = stableFactId({
    placeId: fact.placeId,
    kind: fact.kind,
    unit: fact.unit,
    audience: fact.audience,
    usageKind: fact.usageKind,
    sourceUrl: fact.sourceUrl,
    amountMinJpy: fact.amountMinJpy,
    quote: fact.quote,
  });
  return fact.id !== currentId;
}

export async function deleteFact(factId: string): Promise<void> {
  if (useFirestore()) {
    await adminDb().collection(col(FACTS)).doc(factId).delete();
    return;
  }
  const db = readFileDb();
  delete db.facts[factId];
  writeFileDb(db);
}

/** 指定 place の旧形式 fact を削除。戻り値は削除件数。 */
export async function purgeLegacyFactsForPlace(placeId: string): Promise<number> {
  const facts = await listFactsForPlace(placeId);
  let removed = 0;
  for (const fact of facts) {
    if (!isLegacyPriceFact(fact)) continue;
    await deleteFact(fact.id);
    removed += 1;
  }
  return removed;
}

export async function getDailyPriceEnrichBudget(
  dateTokyo: string,
): Promise<{ runs: number; costUsd: number }> {
  if (useFirestore()) {
    const snap = await adminDb().collection(col(DAILY)).doc(dateTokyo).get();
    if (!snap.exists) return { runs: 0, costUsd: 0 };
    const data = snap.data() as { runs?: number; costUsd?: number };
    return { runs: data.runs ?? 0, costUsd: data.costUsd ?? 0 };
  }
  return readFileDb().daily[dateTokyo] ?? { runs: 0, costUsd: 0 };
}

/** Reserve one run slot for the Tokyo day (before kick). Cost USD is added after the run. */
export async function tryConsumeDailyPriceEnrichSlot(
  dateTokyo: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (useFirestore()) {
    const ref = adminDb().collection(col(DAILY)).doc(dateTokyo);
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = (snap.data() as { runs?: number; costUsd?: number } | undefined) ?? {};
      const runs = cur.runs ?? 0;
      const costUsd = cur.costUsd ?? 0;
      if (runs >= LIMITS.maxPriceEnrichRunsPerDay) {
        return { ok: false as const, reason: `daily_run_cap:${LIMITS.maxPriceEnrichRunsPerDay}` };
      }
      if (costUsd >= LIMITS.maxPriceEnrichCostUsdPerDay) {
        return { ok: false as const, reason: `daily_cost_cap_usd:${LIMITS.maxPriceEnrichCostUsdPerDay}` };
      }
      tx.set(ref, { runs: runs + 1, costUsd, dateTokyo }, { merge: true });
      return { ok: true as const };
    });
  }
  const db = readFileDb();
  const cur = db.daily[dateTokyo] ?? { runs: 0, costUsd: 0 };
  if (cur.runs >= LIMITS.maxPriceEnrichRunsPerDay) {
    return { ok: false, reason: `daily_run_cap:${LIMITS.maxPriceEnrichRunsPerDay}` };
  }
  if (cur.costUsd >= LIMITS.maxPriceEnrichCostUsdPerDay) {
    return { ok: false, reason: `daily_cost_cap_usd:${LIMITS.maxPriceEnrichCostUsdPerDay}` };
  }
  db.daily[dateTokyo] = { runs: cur.runs + 1, costUsd: cur.costUsd };
  writeFileDb(db);
  return { ok: true };
}

export async function addDailyPriceEnrichCost(dateTokyo: string, costUsd: number): Promise<void> {
  if (!(costUsd > 0)) return;
  if (useFirestore()) {
    const ref = adminDb().collection(col(DAILY)).doc(dateTokyo);
    await adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = (snap.data() as { runs?: number; costUsd?: number } | undefined) ?? {};
      tx.set(
        ref,
        { runs: cur.runs ?? 0, costUsd: (cur.costUsd ?? 0) + costUsd, dateTokyo },
        { merge: true },
      );
    });
    return;
  }
  const db = readFileDb();
  const cur = db.daily[dateTokyo] ?? { runs: 0, costUsd: 0 };
  db.daily[dateTokyo] = { runs: cur.runs, costUsd: cur.costUsd + costUsd };
  writeFileDb(db);
}
