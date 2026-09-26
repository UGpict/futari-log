import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "@/config/env";
import { adminDb } from "@/server/firebase/admin";
import { col } from "@/server/repositories/layout";

const OPS_COUNTERS = "opsCounters";

type FileDb = { counters: Record<string, number> };

/** In-process map for OPS_COUNTER_BACKEND=memory (unit tests). */
const memory = new Map<string, number>();

function storeDir(): string {
  const override = process.env.STORE_DIR?.trim();
  return override && override.length > 0 ? override : join(process.cwd(), ".data");
}

function filePath(): string {
  return join(storeDir(), "ops-counters.json");
}

function readFileDb(): FileDb {
  const path = filePath();
  if (!existsSync(path)) return { counters: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<FileDb>;
    return { counters: parsed.counters ?? {} };
  } catch {
    return { counters: {} };
  }
}

function writeFileDb(db: FileDb): void {
  mkdirSync(storeDir(), { recursive: true });
  writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

type CounterBackend = "memory" | "file" | "firestore";

function resolveBackend(): CounterBackend {
  const forced = process.env.OPS_COUNTER_BACKEND?.trim();
  if (forced === "memory" || forced === "file" || forced === "firestore") return forced;
  return getEnv().dataBackend === "firestore" ? "firestore" : "file";
}

/** Test helper: clear memory counters (and file when using file backend). */
export function resetOpsCountersForTests(): void {
  memory.clear();
  if (resolveBackend() === "file") {
    try {
      writeFileDb({ counters: {} });
    } catch {
      // ignore
    }
  }
}

/**
 * Atomically increment a counter if still under `limit`.
 * Returns the new value on success, or the current value when over limit (no increment).
 */
export async function tryIncrementCounter(
  key: string,
  limit: number,
): Promise<{ ok: true; value: number } | { ok: false; value: number }> {
  if (limit <= 0) return { ok: false, value: 0 };
  const backend = resolveBackend();

  if (backend === "memory") {
    const cur = memory.get(key) ?? 0;
    if (cur >= limit) return { ok: false, value: cur };
    const next = cur + 1;
    memory.set(key, next);
    return { ok: true, value: next };
  }

  if (backend === "firestore") {
    const ref = adminDb().collection(col(OPS_COUNTERS)).doc(encodeDocId(key));
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = (snap.data() as { count?: number } | undefined)?.count ?? 0;
      if (cur >= limit) return { ok: false as const, value: cur };
      const next = cur + 1;
      tx.set(ref, { count: next, key, updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true as const, value: next };
    });
  }

  const db = readFileDb();
  const cur = db.counters[key] ?? 0;
  if (cur >= limit) return { ok: false, value: cur };
  const next = cur + 1;
  db.counters[key] = next;
  writeFileDb(db);
  return { ok: true, value: next };
}

function encodeDocId(key: string): string {
  return key.replaceAll("/", "__");
}
