import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TIME_ZONE } from "./settings";

function loadDotEnv() {
  const g = globalThis as { __futariEnvLoaded?: boolean };
  if (g.__futariEnvLoaded) return;
  g.__futariEnvLoaded = true;
  for (const name of [".env.local", ".env"]) {
    const file = resolve(/* turbopackIgnore: true */ process.cwd(), name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (process.env[key] == null || process.env[key] === "") {
        process.env[key] = value;
      }
    }
  }
}

loadDotEnv();

function read(name: string): string | null {
  const value = process.env[name];
  if (value == null || value.trim() === "") return null;
  return value.trim();
}

function readBool(name: string, fallback: boolean): boolean {
  const value = read(name);
  if (value == null) return fallback;
  return value === "true" || value === "1";
}

function readNumber(name: string, fallback: number): number {
  const value = read(name);
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export type RuntimeMode = "MOCK" | "LIVE";

export function getEnv() {
  const firebaseConfigured = Boolean(
    read("NEXT_PUBLIC_FIREBASE_API_KEY") &&
      read("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") &&
      read("NEXT_PUBLIC_FIREBASE_PROJECT_ID") &&
      read("NEXT_PUBLIC_FIREBASE_APP_ID"),
  );
  const orcaConfigured = Boolean(read("ORCAROUTER_API_KEY"));
  const mapsConfigured = Boolean(read("GOOGLE_MAPS_API_KEY"));
  const requested = (read("APP_RUNTIME") ?? "MOCK").toUpperCase();
  const liveReady = firebaseConfigured && orcaConfigured && mapsConfigured;
  const runtime: RuntimeMode =
    requested === "LIVE" && liveReady ? "LIVE" : "MOCK";

  return {
    runtime,
    requestedRuntime: requested === "LIVE" ? ("LIVE" as const) : ("MOCK" as const),
    firebaseConfigured,
    orcaConfigured,
    mapsConfigured,
    orcaBaseUrl: read("ORCAROUTER_BASE_URL") ?? "https://api.orcarouter.ai/v1",
    orcaApiKey: read("ORCAROUTER_API_KEY"),
    orcaMundaneModel: read("ORCAROUTER_MUNDANE_MODEL") ?? "orcarouter/mundane",
    orcaHardModel: read("ORCAROUTER_HARD_MODEL") ?? "orcarouter/hard",
    googleMapsApiKey: read("GOOGLE_MAPS_API_KEY"),
    firebaseProjectId: read("FIREBASE_PROJECT_ID") ?? read("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    enableDemoControls: readBool("ENABLE_DEMO_CONTROLS", false),
    demoAllowedUids: (read("DEMO_ALLOWED_UIDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    demoAreaName: read("DEMO_AREA_NAME") ?? "名古屋駅周辺",
    demoLat: readNumber("DEMO_LAT", 35.170915),
    demoLng: readNumber("DEMO_LNG", 136.881537),
    demoDate: read("DEMO_DATE") ?? "2026-09-19",
    workerConcurrency: Math.max(1, readNumber("WORKER_CONCURRENCY", 1)),
    mockAuthSecret: read("MOCK_AUTH_SECRET") ?? "dev-only-change-me",
    timeZone: TIME_ZONE,
  };
}

export function publicBlockers(): { code: string; item: string; status: "BLOCKED" }[] {
  const env = getEnv();
  const items: { code: string; item: string; status: "BLOCKED" }[] = [];
  if (!env.firebaseConfigured) {
    items.push({
      code: "FIREBASE",
      item: "Firebase Auth / Firestore 未設定",
      status: "BLOCKED",
    });
  }
  if (!env.orcaConfigured) {
    items.push({
      code: "ORCAROUTER",
      item: "OrcaRouter API キー未設定",
      status: "BLOCKED",
    });
  }
  if (!env.mapsConfigured) {
    items.push({
      code: "GOOGLE_MAPS",
      item: "Google Maps API キー未設定",
      status: "BLOCKED",
    });
  }
  items.push({
    code: "VENUE",
    item: "東京の発表会場住所・最寄り駅は未提供。開発時は名古屋駅周辺を明示使用",
    status: "BLOCKED",
  });
  return items;
}
