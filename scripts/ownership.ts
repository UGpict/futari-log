import { execSync } from "node:child_process";

type Owner = "frontend" | "backend" | "shared" | "ops" | "unknown";

function ownerOf(path: string): Owner {
  const p = path.replaceAll("\\", "/");
  if (
    p.startsWith("src/features/") ||
    p.startsWith("src/components/") ||
    p.startsWith("src/client/") ||
    p.startsWith("src/fixtures/") ||
    p === "src/lib/client.ts" ||
    p === "src/app/globals.css" ||
    (p.startsWith("src/app/") && p.endsWith(".tsx") && !p.includes("/api/"))
  ) {
    return "frontend";
  }
  if (p.startsWith("src/contracts/") || p === "src/config/public.ts" || p === "src/lib/time.ts") {
    return "shared";
  }
  if (
    p.startsWith("src/server/") ||
    p.startsWith("src/worker/") ||
    p.startsWith("src/app/api/") ||
    p.startsWith("src/domain/") ||
    p === "src/config/env.ts" ||
    p === "src/config/settings.ts" ||
    p === "src/lib/ids.ts"
  ) {
    return "backend";
  }
  if (p.startsWith("scripts/") || p.startsWith("docs/") || p.startsWith(".github/")) return "ops";
  return "unknown";
}

function changedFiles(): string[] {
  const base = process.env.OWNERSHIP_BASE ?? "origin/main";
  try {
    execSync(`git rev-parse --verify ${base}`, { stdio: "ignore" });
    const out = execSync(`git diff --name-only ${base}...HEAD`, { encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    const out = execSync("git diff --name-only HEAD", { encoding: "utf8" });
    const staged = execSync("git diff --name-only --cached", { encoding: "utf8" });
    return [...out.split("\n"), ...staged.split("\n")].map((s) => s.trim()).filter(Boolean);
  }
}

const groups: Record<Owner, string[]> = {
  frontend: [],
  backend: [],
  shared: [],
  ops: [],
  unknown: [],
};
for (const file of changedFiles()) {
  groups[ownerOf(file)].push(file);
}

console.log("## PR ownership");
console.log("契約（src/contracts）の変更はフロントとバックエンド両方の確認対象です。");
for (const key of ["frontend", "backend", "shared", "ops", "unknown"] as Owner[]) {
  if (!groups[key].length) continue;
  console.log(`\n### ${key}`);
  for (const f of groups[key]) console.log(`- ${f}`);
}
