import "./dev-emulator-env";
import { spawn, type ChildProcess } from "node:child_process";

function run(name: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(name, args, { stdio: "inherit", env, shell: process.platform === "win32" });
  child.on("exit", (code) => {
    if (code) process.exit(code ?? 1);
  });
  return child;
}

async function waitHttp(url: string, label: string) {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(800) });
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function portUp(url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(600) });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const { getEnv } = await import("../src/config/env");
  const env = getEnv();
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  const children: ChildProcess[] = [];

  if (env.emulator) {
    const authHost = env.authEmulatorHost ?? "127.0.0.1:9099";
    const fsHost = env.firestoreEmulatorHost ?? "127.0.0.1:8080";
    const projectId = env.firebaseProjectId ?? "demo-futari-log";
    childEnv.USE_FIREBASE_EMULATOR = "true";
    childEnv.FIREBASE_AUTH_EMULATOR_HOST = authHost;
    childEnv.FIRESTORE_EMULATOR_HOST = fsHost;
    childEnv.FIREBASE_PROJECT_ID = projectId;
    childEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
    childEnv.NEXT_PUBLIC_FIREBASE_API_KEY = env.firebaseApiKey ?? "fake-api-key-for-emulator";
    childEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = env.firebaseAuthDomain ?? "localhost";
    childEnv.NEXT_PUBLIC_FIREBASE_APP_ID = env.firebaseAppId ?? "1:0:web:emulator";

    const already = (await portUp(`http://${authHost}`)) && (await portUp(`http://${fsHost}`));
    if (!already) {
      console.log("Starting Auth / Firestore emulators…");
      children.push(
        run("npx", ["firebase", "emulators:start", "--only", "auth,firestore", "--project", projectId], childEnv),
      );
    } else {
      console.log("Auth / Firestore emulators already running");
    }
    await waitHttp(`http://${authHost}`, "Auth emulator");
    await waitHttp(`http://${fsHost}`, "Firestore emulator");
  }

  children.push(run("npx", ["next", "dev", "-p", "3000"], childEnv));
  children.push(run("npx", ["tsx", "src/worker/index.ts"], childEnv));

  function shutdown() {
    for (const child of children) child.kill("SIGTERM");
  }
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
