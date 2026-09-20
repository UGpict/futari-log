import { spawn } from "node:child_process";

const web = spawn("npx", ["next", "start", "-p", "3000"], { stdio: "inherit", shell: process.platform === "win32" });
const worker = spawn("npx", ["tsx", "src/worker/index.ts"], { stdio: "inherit", shell: process.platform === "win32" });
function shutdown() {
  web.kill("SIGTERM");
  worker.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
