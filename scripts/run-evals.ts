/**
 * Eval harness CLI.
 * Isolates STORE_DIR, forces APP_RUNTIME=MOCK + DATA_BACKEND=file, runs all evals/scenarios/*.json.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAllScenarios } from "../evals/harness/fixture";
import { buildReport, formatTable, writeLatestReport } from "../evals/harness/report";
import { runScenario } from "../evals/harness/runScenario";

async function main() {
  const storeDir = mkdtempSync(join(tmpdir(), "futari-eval-"));
  process.env.APP_RUNTIME = "MOCK";
  process.env.DATA_BACKEND = "file";
  process.env.USE_FIREBASE_EMULATOR = process.env.USE_FIREBASE_EMULATOR ?? "false";
  process.env.ENABLE_EVENT_CATALOG = process.env.ENABLE_EVENT_CATALOG ?? "false";
  process.env.STORE_DIR = storeDir;

  const startedAt = new Date().toISOString();
  console.log(`STORE_DIR=${storeDir}`);
  console.log("APP_RUNTIME=MOCK DATA_BACKEND=file");

  const scenarios = loadAllScenarios();
  if (!scenarios.length) {
    console.error("No scenarios found under evals/scenarios/");
    process.exit(1);
  }

  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`… ${scenario.id}\n`);
    const result = await runScenario(scenario);
    results.push(result);
    const mark = result.status === "pass" ? "ok" : result.status === "skip" ? "skip" : "FAIL";
    console.log(`  ${mark} ${scenario.id}`);
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({ results, storeDir, startedAt, finishedAt });
  console.log("");
  console.log(formatTable(report));
  const outPath = writeLatestReport(report);
  console.log(`wrote ${outPath}`);

  try {
    rmSync(storeDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }

  if (report.totals.failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
