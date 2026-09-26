/**
 * Phase 2b synthetic: run a fixed subset of Phase 1 eval fixtures in MOCK.
 * Reuses evals/harness/runScenario — does not duplicate planner logic.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNTHETIC_PLAN_SMOKE_IDS } from "@/config/settings";
import { loadScenarioFile, scenariosDir } from "../../../evals/harness/fixture";
import { runScenario, type ScenarioResult } from "../../../evals/harness/runScenario";
import { emitSyntheticPlanSmoke } from "./metrics";

export type PlanSmokeResult = {
  ok: boolean;
  passed: number;
  failed: number;
  skipped: number;
  latencyMs: number;
  results: Array<{ id: string; status: ScenarioResult["status"]; error?: string }>;
};

const DEFAULT_IDS: readonly string[] = SYNTHETIC_PLAN_SMOKE_IDS;

/**
 * Isolates STORE_DIR and forces MOCK like `npm run eval`, then runs the smoke fixture set.
 */
export async function runPlanSmokeSynthetic(opts?: {
  ids?: readonly string[];
}): Promise<PlanSmokeResult> {
  const ids = opts?.ids?.length ? opts.ids : DEFAULT_IDS;
  const storeDir = mkdtempSync(join(tmpdir(), "futari-synthetic-"));
  const prev = {
    APP_RUNTIME: process.env.APP_RUNTIME,
    DATA_BACKEND: process.env.DATA_BACKEND,
    STORE_DIR: process.env.STORE_DIR,
    ENABLE_EVENT_CATALOG: process.env.ENABLE_EVENT_CATALOG,
  };
  process.env.APP_RUNTIME = "MOCK";
  process.env.DATA_BACKEND = "file";
  process.env.STORE_DIR = storeDir;
  process.env.ENABLE_EVENT_CATALOG = process.env.ENABLE_EVENT_CATALOG ?? "false";

  const started = Date.now();
  const results: ScenarioResult[] = [];
  try {
    for (const id of ids) {
      const path = join(scenariosDir(), `${id}.json`);
      const scenario = loadScenarioFile(path);
      results.push(await runScenario(scenario));
    }
  } finally {
    if (prev.APP_RUNTIME == null) delete process.env.APP_RUNTIME;
    else process.env.APP_RUNTIME = prev.APP_RUNTIME;
    if (prev.DATA_BACKEND == null) delete process.env.DATA_BACKEND;
    else process.env.DATA_BACKEND = prev.DATA_BACKEND;
    if (prev.STORE_DIR == null) delete process.env.STORE_DIR;
    else process.env.STORE_DIR = prev.STORE_DIR;
    if (prev.ENABLE_EVENT_CATALOG == null) delete process.env.ENABLE_EVENT_CATALOG;
    else process.env.ENABLE_EVENT_CATALOG = prev.ENABLE_EVENT_CATALOG;
    try {
      rmSync(storeDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }

  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  const latencyMs = Date.now() - started;
  const ok = failed === 0 && results.length > 0;
  emitSyntheticPlanSmoke({ ok, passed, failed, latency_ms: latencyMs });
  return {
    ok,
    passed,
    failed,
    skipped,
    latencyMs,
    results: results.map((r) => ({
      id: r.id,
      status: r.status,
      error: r.error ?? r.failures?.[0],
    })),
  };
}
