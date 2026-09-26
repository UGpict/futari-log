/**
 * Phase 2b synthetic: run a fixed subset of Phase 1 eval fixtures in MOCK.
 * Reuses evals/harness/runScenario — does not duplicate planner logic.
 *
 * Uses request-scoped `runWithEnvScopeAsync` (not process.env mutation) so concurrent
 * LIVE traffic on the same Cloud Run instance cannot briefly observe MOCK.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SYNTHETIC_PLAN_SMOKE_IDS } from "@/config/settings";
import { runWithEnvScopeAsync } from "@/config/env";
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
 * Isolates file store via AsyncLocalStorage + forces MOCK/file for this async tree only.
 */
export async function runPlanSmokeSynthetic(opts?: {
  ids?: readonly string[];
}): Promise<PlanSmokeResult> {
  const ids = opts?.ids?.length ? opts.ids : DEFAULT_IDS;
  const storeDir = mkdtempSync(join(tmpdir(), "futari-synthetic-"));
  const started = Date.now();

  try {
    return await runWithEnvScopeAsync(
      {
        runtime: "MOCK",
        dataBackend: "file",
        storeDir,
        enableEventCatalog: false,
      },
      async () => {
        const results: ScenarioResult[] = [];
        for (const id of ids) {
          const path = join(scenariosDir(), `${id}.json`);
          const scenario = loadScenarioFile(path);
          results.push(await runScenario(scenario));
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
      },
    );
  } finally {
    try {
      rmSync(storeDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}
