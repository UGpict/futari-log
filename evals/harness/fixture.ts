import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { evalScenarioSchema, type EvalScenario } from "./schema";

export function scenariosDir(root = process.cwd()): string {
  return join(root, "evals", "scenarios");
}

export function listScenarioFiles(dir = scenariosDir()): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name))
    .sort();
}

export function loadScenarioFile(path: string): EvalScenario {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const parsed = evalScenarioSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid scenario ${path}: ${detail}`);
  }
  return parsed.data;
}

export function loadAllScenarios(dir = scenariosDir()): EvalScenario[] {
  return listScenarioFiles(dir).map(loadScenarioFile);
}
