/**
 * Copy sys/root payload into split collections.
 * Does not delete or overwrite sys/root.
 *
 *   npx tsx scripts/migrate-firestore-split.ts --dry-run
 *   npx tsx scripts/migrate-firestore-split.ts --dry-run --source=sys/root
 *   npx tsx scripts/migrate-firestore-split.ts --apply --namespace=localverify20260920
 *
 * Production cutover (--apply without namespace) is not run until verification is reviewed.
 */
import { adminDb } from "../src/server/firebase/admin";
import { getEnv } from "../src/config/env";
import { LEGACY_ROOT_DOC } from "../src/server/repositories/layout";
import { emptyDb, type Db } from "../src/server/repositories/types";
import { assertRelationships, splitCounts, splitDocPaths } from "../src/server/repositories/splitMap";
import { writeSplitFromDb } from "../src/server/repositories/firestoreSplit";

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

async function main() {
  const dryRun = arg("apply") !== "true";
  const source = arg("source") || LEGACY_ROOT_DOC;
  const namespace = arg("namespace");
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

  const report = {
    ok: relationshipErrors.length === 0,
    dryRun,
    source,
    namespace: process.env.FIRESTORE_NAMESPACE ?? "",
    leavesSysRoot: true,
    counts,
    documentCount: paths.length,
    sessionIds,
    runIds,
    relationshipErrors,
    samplePaths: paths.slice(0, 20),
  };

  if (dryRun || relationshipErrors.length) {
    console.log(JSON.stringify(report, null, 2));
    if (relationshipErrors.length) process.exit(1);
    return;
  }

  const written = await writeSplitFromDb(db);
  console.log(JSON.stringify({ ...report, written }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
