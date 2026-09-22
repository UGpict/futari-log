/**
 * Run MOCK unit tests: every tests/*.test.ts except emulator / live suites.
 * New *.test.ts files are picked up automatically.
 */
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Isolate file-backend store from live next/worker `.data/store.json`.
const storeDir = mkdtempSync(join(tmpdir(), "futari-store-"));
console.log(`MOCK unit tests (${files.length}): ${files.map((f) => f.replace(/\\/g, "/")).join(", ")}`);
console.log(`STORE_DIR=${storeDir}`);

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: {
    ...process.env,
    APP_RUNTIME: process.env.APP_RUNTIME ?? "MOCK",
    DATA_BACKEND: process.env.DATA_BACKEND ?? "file",
    USE_FIREBASE_EMULATOR: process.env.USE_FIREBASE_EMULATOR ?? "false",
    STORE_DIR: process.env.STORE_DIR?.trim() || storeDir,
  },
});

rmSync(storeDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
