import { spawn } from "node:child_process";
import { getEnv } from "../src/config/env";

const env = getEnv();
const port = String(env.port);
const childEnv = { ...process.env, PORT: port };

const web = spawn("npx", ["next", "start", "-H", "0.0.0.0", "-p", port], {
  stdio: "inherit",
  env: childEnv,
  shell: process.platform === "win32",
});
const worker = spawn("npx", ["tsx", "src/worker/index.ts"], {
  stdio: "inherit",
  env: childEnv,
  shell: process.platform === "win32",
});

function shutdown() {
  web.kill("SIGTERM");
  worker.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
web.on("exit", (code) => {
  if (code) process.exit(code);
});
