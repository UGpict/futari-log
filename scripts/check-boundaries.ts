import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(process.cwd(), "src");

const FRONTEND_DIRS = ["features", "components", "client", "fixtures"];
const FORBIDDEN = [
  { re: /from\s+["']@\/server(\/[^"']*)?["']/, msg: "@/server" },
  { re: /from\s+["']@\/worker(\/[^"']*)?["']/, msg: "@/worker" },
  { re: /from\s+["']@\/config\/env["']/, msg: "@/config/env" },
  { re: /from\s+["']@\/config\/settings["']/, msg: "@/config/settings (use @/config/public)" },
  { re: /from\s+["']@\/domain(\/[^"']*)?["']/, msg: "@/domain" },
  { re: /from\s+["']firebase-admin["']/, msg: "firebase-admin" },
  { re: /from\s+["']@\/lib\/ids["']/, msg: "@/lib/ids" },
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(full);
  }
  return acc;
}

function isFrontendFile(file: string): boolean {
  const rel = relative(ROOT, file).replaceAll("\\", "/");
  if (FRONTEND_DIRS.some((d) => rel.startsWith(`${d}/`))) return true;
  if (rel.startsWith("app/") && rel.endsWith(".tsx") && !rel.startsWith("app/api/")) return true;
  return false;
}

const files = walk(ROOT).filter(isFrontendFile);
const violations: string[] = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const rule of FORBIDDEN) {
    if (rule.re.test(text)) {
      violations.push(`${relative(process.cwd(), file)} imports ${rule.msg}`);
    }
  }
}

if (violations.length) {
  console.error("boundary violations:");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`check:boundaries PASS (${files.length} frontend files)`);
