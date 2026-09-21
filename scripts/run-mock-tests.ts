/**
 * Run MOCK unit tests: every tests/*.test.ts except emulator / live suites.
 * New *.test.ts files are picked up automatically.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const EXCLUDE = new Set([
  "firebase.test.ts", // Auth/Firestore Emulator — npm run test:emulator
]);

const dir = join(process.cwd(), "tests");
const files = readdirSync(dir)
  .filter((name) => name.endsWith(".test.ts") && !EXCLUDE.has(name))
  .filter((name) => !name.includes(".live.") && !name.endsWith("-live.test.ts"))
  .map((name) => join("tests", name))
  .sort();

if (files.length === 0) {
  console.error("No MOCK unit tests found under tests/");
  process.exit(1);
}

console.log(`MOCK unit tests (${files.length}): ${files.map((f) => f.replace(/\\/g, "/")).join(", ")}`);

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: {
    ...process.env,
    APP_RUNTIME: process.env.APP_RUNTIME ?? "MOCK",
    DATA_BACKEND: process.env.DATA_BACKEND ?? "file",
    USE_FIREBASE_EMULATOR: process.env.USE_FIREBASE_EMULATOR ?? "false",
  },
});

process.exit(result.status ?? 1);
