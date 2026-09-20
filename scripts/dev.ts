import { spawn } from "node:child_process";

function run(name: string, args: string[]) {
  const child = spawn(name, args, { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  child.on("exit", (code) => {
    if (code) process.exit(code ?? 1);
  });
  return child;
}

const web = run("npx", ["next", "dev", "-p", "3000"]);
const worker = run("npx", ["tsx", "src/worker/index.ts"]);

function shutdown() {
  web.kill("SIGTERM");
  worker.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
