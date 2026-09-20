/**
 * Copy sys/root payload into split collections.
 * Does not delete or overwrite sys/root.
 *
 *   npx tsx scripts/migrate-firestore-split.ts --dry-run
 *   npx tsx scripts/migrate-firestore-split.ts --dry-run --source=sys/root
 *   npx tsx scripts/migrate-firestore-split.ts --apply --namespace=rehearse20260920
 *   npx tsx scripts/migrate-firestore-split.ts --apply --namespace=rehearse20260920 --if-missing
 *   npx tsx scripts/migrate-firestore-split.ts --compare --namespace=rehearse20260920
 *
 * Production cutover (--apply without namespace) is refused until explicitly enabled later.
 */
import { adminDb } from "../src/server/firebase/admin";
import { getEnv } from "../src/config/env";
import { LEGACY_ROOT_DOC } from "../src/server/repositories/layout";
import { emptyDb, type Db } from "../src/server/repositories/types";
import { assertRelationships, splitCounts, splitDocPaths } from "../src/server/repositories/splitMap";
import { listSplitInventory, writeSplitFromDb } from "../src/server/repositories/firestoreSplit";

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  if (hit.includes("=")) return hit.slice(hit.indexOf("=") + 1);
  return "true";
}

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

function diffIds(source: string[], dest: string[]) {
  const src = new Set(source);
  const dst = new Set(dest);
  return {
    sourceOnly: source.filter((id) => !dst.has(id)).slice(0, 20),
    destOnly: dest.filter((id) => !src.has(id)).slice(0, 20),
    both: source.filter((id) => dst.has(id)).length,
    sourceCount: source.length,
    destCount: dest.length,
  };
}

async function main() {
  const apply = arg("apply") === "true";
  const compare = arg("compare") === "true";
  const dryRun = !apply;
  const source = arg("source") || LEGACY_ROOT_DOC;
  const namespace = arg("namespace");
  const ifMissing = arg("if-missing") === "true";
  if ((apply || compare) && (!namespace || namespace === "true")) {
    throw new Error("refusing to apply/compare without --namespace; production cutover is not enabled");
  }
  if (namespace && namespace !== "true") process.env.FIRESTORE_NAMESPACE = namespace;
  const env = getEnv();
  if (env.dataBackend !== "firestore") {
    throw new Error("DATA_BACKEND must be firestore; file fallback is not used");
  }

  const snap = await adminDb().doc(source).get();
  if (!snap.exists) {
    console.log(JSON.stringify({ ok: false, error: `source missing: ${source}` }, null, 2));
    process.exit(1);
  }
  const db = parsePayload(snap.data()?.payload);
  const counts = splitCounts(db);
  const paths = splitDocPaths(db);
  const relationshipErrors = assertRelationships(db);
  const sessionIds = Object.values(db.couples).flatMap((c) => Object.keys(c.sessions));
  const runIds = Object.values(db.couples).flatMap((c) =>
    Object.values(c.sessions).flatMap((b) => Object.keys(b.runs)),
  );
  const coupleIds = Object.keys(db.couples);

  const report: Record<string, unknown> = {
    ok: relationshipErrors.length === 0,
    dryRun,
    compare,
    source,
    namespace: namespace && namespace !== "true" ? namespace : "",
    leavesSysRoot: true,
    counts,
    documentCount: paths.length,
    coupleIds: coupleIds.slice(0, 20),
    sessionIds: sessionIds.slice(0, 20),
    runIds: runIds.slice(0, 20),
    coupleCount: coupleIds.length,
    sessionCount: sessionIds.length,
    runCount: runIds.length,
    relationshipErrors,
    samplePaths: paths.slice(0, 20),
  };

  if (relationshipErrors.length) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (dryRun && !compare) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (apply) {
    const written = await writeSplitFromDb(db, { ifMissing });
    report.written = written.written;
    report.skipped = written.skipped;
    report.ifMissing = ifMissing;
  }

  if (apply || compare) {
    const inventory = await listSplitInventory();
    report.inventory = {
      couples: inventory.couples.length,
      sessions: inventory.sessions.length,
      runs: inventory.runs.length,
      events: inventory.events,
      planVersions: inventory.planVersions,
    };
    report.idDiff = {
      couples: diffIds(coupleIds, inventory.couples),
      sessions: diffIds(sessionIds, inventory.sessions),
      runs: diffIds(runIds, inventory.runs),
    };
    report.ok =
      relationshipErrors.length === 0 &&
      inventory.couples.length >= coupleIds.length &&
      inventory.sessions.length >= sessionIds.length &&
      inventory.runs.length >= runIds.length;
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
