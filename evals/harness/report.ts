import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvalFamily } from "./schema";
import type { ScenarioResult } from "./runScenario";

export type EvalReport = {
  startedAt: string;
  finishedAt: string;
  storeDir: string;
  totals: {
    scenarios: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  byFamily: Record<string, { total: number; passed: number; failed: number; skipped: number }>;
  results: ScenarioResult[];
};

export function buildReport(args: {
  results: ScenarioResult[];
  storeDir: string;
  startedAt: string;
  finishedAt: string;
}): EvalReport {
  const byFamily: EvalReport["byFamily"] = {};
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of args.results) {
    const family = result.family as EvalFamily;
    if (!byFamily[family]) {
      byFamily[family] = { total: 0, passed: 0, failed: 0, skipped: 0 };
    }
    byFamily[family].total += 1;
    if (result.status === "pass") {
      passed += 1;
      byFamily[family].passed += 1;
    } else if (result.status === "skip") {
      skipped += 1;
      byFamily[family].skipped += 1;
    } else {
      failed += 1;
      byFamily[family].failed += 1;
    }
  }
  return {
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    storeDir: args.storeDir,
    totals: {
      scenarios: args.results.length,
      passed,
      failed,
      skipped,
    },
    byFamily,
    results: args.results,
  };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

export function formatTable(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("Eval harness results");
  lines.push(
    `${pad("STATUS", 8)} ${pad("FAMILY", 16)} ${pad("ID", 32)} ${pad("OUTCOME", 14)} LATENCY`,
  );
  lines.push("-".repeat(86));
  for (const result of report.results) {
    const status = result.status.toUpperCase();
    const outcome = result.observed?.outcome ?? result.skipReason?.slice(0, 12) ?? "-";
    const latency = result.metrics ? `${result.metrics.latency_ms}ms` : "-";
    lines.push(
      `${pad(status, 8)} ${pad(result.family, 16)} ${pad(result.id, 32)} ${pad(String(outcome), 14)} ${latency}`,
    );
    if (result.failures?.length) {
      for (const failure of result.failures) {
        lines.push(`         ! ${failure}`);
      }
    }
  }
  lines.push("-".repeat(86));
  lines.push(
    `totals: ${report.totals.passed} pass / ${report.totals.failed} fail / ${report.totals.skipped} skip (of ${report.totals.scenarios})`,
  );
  const familyLines = Object.entries(report.byFamily)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([family, row]) =>
        `  ${family}: ${row.passed}/${row.total - row.skipped} pass` +
        (row.skipped ? ` (${row.skipped} skip)` : "") +
        (row.failed ? ` ${row.failed} fail` : ""),
    );
  if (familyLines.length) {
    lines.push("by family:");
    lines.push(...familyLines);
  }
  return lines.join("\n");
}

export function writeLatestReport(report: EvalReport, root = process.cwd()): string {
  const outDir = join(root, "evals", "out");
  mkdirSync(outDir, { recursive: true });
  const latest = join(outDir, "latest.json");
  writeFileSync(latest, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return latest;
}
