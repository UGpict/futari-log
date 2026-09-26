import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { API_BUDGETS, RATE_LIMITS, TIME_ZONE } from "./settings";
import { tokyoToday } from "./public";

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

function resolveDemoDate(): string {
  const today = tokyoToday();
  const raw = read("DEMO_DATE");
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw >= today) return raw;
  return today;
}

export type RuntimeMode = "MOCK" | "LIVE";
export type DataBackend = "file" | "firestore";
export type AuthBackend = "mock" | "firebase";

const EMULATOR_AUTH_HOST = "127.0.0.1:9099";
const EMULATOR_FIRESTORE_HOST = "127.0.0.1:8080";
const EMULATOR_PROJECT = "demo-futari-log";

export function getEnv() {
  const useEmulator = readBool("USE_FIREBASE_EMULATOR", false);
  const authEmulatorHost = useEmulator
    ? (read("FIREBASE_AUTH_EMULATOR_HOST") ?? EMULATOR_AUTH_HOST)
    : null;
  const firestoreEmulatorHost = useEmulator
    ? (read("FIRESTORE_EMULATOR_HOST") ?? EMULATOR_FIRESTORE_HOST)
    : null;
  const emulator = useEmulator && Boolean(authEmulatorHost && firestoreEmulatorHost);

  if (emulator) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= authEmulatorHost!;
    process.env.FIRESTORE_EMULATOR_HOST ??= firestoreEmulatorHost!;
  } else {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;
  }

  const firebaseProjectId =
    read("FIREBASE_PROJECT_ID") ??
    read("NEXT_PUBLIC_FIREBASE_PROJECT_ID") ??
    (emulator ? EMULATOR_PROJECT : null);

  const firebaseApiKey =
    read("NEXT_PUBLIC_FIREBASE_API_KEY") ?? (emulator ? "fake-api-key-for-emulator" : null);
  const firebaseAuthDomain =
    read("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN") ?? (emulator ? "localhost" : null);
  const firebaseAppId =
    read("NEXT_PUBLIC_FIREBASE_APP_ID") ?? (emulator ? "1:0:web:emulator" : null);

  const firebasePublicConfigured = Boolean(
    firebaseApiKey && firebaseAuthDomain && firebaseProjectId && firebaseAppId,
  );
  const firebaseConfigured = emulator || firebasePublicConfigured;
  const orcaConfigured = Boolean(read("ORCAROUTER_API_KEY"));
  const mapsConfigured = Boolean(read("GOOGLE_MAPS_API_KEY"));
  const geminiApiKey = read("GEMINI_API_KEY");
  const geminiVia = geminiApiKey ? ("google" as const) : orcaConfigured ? ("orcarouter" as const) : null;
  const geminiConfigured = geminiVia != null;
  const requested = (read("APP_RUNTIME") ?? "MOCK").toUpperCase();
  const uiFixtures = readBool("NEXT_PUBLIC_USE_API_FIXTURES", false);
  const liveReady =
    firebaseConfigured && orcaConfigured && mapsConfigured && !emulator && !uiFixtures;
  const runtime: RuntimeMode = requested === "LIVE" && liveReady ? "LIVE" : "MOCK";

  const explicitBackend = read("DATA_BACKEND");
  const dataBackend: DataBackend =
    explicitBackend === "file"
      ? "file"
      : explicitBackend === "firestore"
        ? "firestore"
        : emulator || firebasePublicConfigured
          ? "firestore"
          : "file";

  const explicitAuth = read("AUTH_BACKEND");
  const authBackend: AuthBackend =
    explicitAuth === "mock" || explicitAuth === "firebase"
      ? explicitAuth
      : emulator || firebasePublicConfigured
        ? "firebase"
        : "mock";
  const onCloudRun = Boolean(read("K_SERVICE"));

  return {
    runtime,
    requestedRuntime: requested === "LIVE" ? ("LIVE" as const) : ("MOCK" as const),
    firebaseConfigured,
    firebasePublicConfigured,
    orcaConfigured,
    mapsConfigured,
    geminiConfigured,
    geminiVia,
    emulator,
    authEmulatorHost,
    firestoreEmulatorHost,
    dataBackend,
    authBackend,
    orcaBaseUrl: read("ORCAROUTER_BASE_URL") ?? "https://api.orcarouter.ai/v1",
    orcaApiKey: read("ORCAROUTER_API_KEY"),
    orcaMundaneModel: read("ORCAROUTER_MUNDANE_MODEL") ?? "orcarouter/futari-mundane",
    orcaHardModel: read("ORCAROUTER_HARD_MODEL") ?? "orcarouter/futari-hard",
    googleMapsApiKey: read("GOOGLE_MAPS_API_KEY"),
    geminiApiKey,
    geminiModel: read("GEMINI_MODEL") ?? "google/gemini-3.5-flash",
    firebaseProjectId,
    firebaseApiKey,
    firebaseAuthDomain,
    firebaseAppId,
    enableDemoControls: readBool("ENABLE_DEMO_CONTROLS", false),
    /**
     * Tournament calendar stickers only. LIVE/search/plan unchanged.
     * Runtime Cloud Run env works (passed into the home page as props).
     * NEXT_PUBLIC_* is also accepted for local production builds.
     */
    demoCalendarStickers:
      readBool("DEMO_CALENDAR_STICKERS", false) ||
      readBool("NEXT_PUBLIC_DEMO_CALENDAR_STICKERS", false),
    demoCalendarAnchorDate: (() => {
      const raw =
        read("DEMO_CALENDAR_ANCHOR_DATE") ?? read("NEXT_PUBLIC_DEMO_CALENDAR_ANCHOR_DATE");
      return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "2026-09-21";
    })(),
    demoAllowedUids: (read("DEMO_ALLOWED_UIDS") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    demoAreaName: read("DEMO_AREA_NAME") ?? "東京駅周辺",
    demoLat: readNumber("DEMO_LAT", 35.681236),
    demoLng: readNumber("DEMO_LNG", 139.767125),
    demoDate: resolveDemoDate(),
    enableEventCatalog: readBool("ENABLE_EVENT_CATALOG", false),
    orcaSearchModel: read("ORCAROUTER_SEARCH_MODEL") ?? "google/gemini-2.5-flash",
    ingestMaxEvents: Math.max(1, Math.min(10, readNumber("INGEST_MAX_EVENTS", 10))),
    ingestOidcAudience:
      read("INGEST_OIDC_AUDIENCE") ??
      (read("PUBLIC_BASE_URL")
        ? `${read("PUBLIC_BASE_URL")!.replace(/\/$/, "")}/api/internal/catalog/ingest`
        : null),
    ingestOidcServiceAccount: read("INGEST_OIDC_SERVICE_ACCOUNT"),
    /**
     * Synthetic plan-smoke OIDC (Cloud Scheduler). Falls back to ingest SA when unset.
     * Audience defaults to PUBLIC_BASE_URL + /api/internal/synthetic/plan-smoke.
     */
    syntheticOidcAudience:
      read("SYNTHETIC_OIDC_AUDIENCE") ??
      (read("PUBLIC_BASE_URL")
        ? `${read("PUBLIC_BASE_URL")!.replace(/\/$/, "")}/api/internal/synthetic/plan-smoke`
        : null),
    syntheticOidcServiceAccount:
      read("SYNTHETIC_OIDC_SERVICE_ACCOUNT") ?? read("INGEST_OIDC_SERVICE_ACCOUNT"),
    workerConcurrency: Math.max(1, readNumber("WORKER_CONCURRENCY", 1)),
    planOrchestrator: read("PLAN_ORCHESTRATOR") === "workflows" ? ("workflows" as const) : ("worker" as const),
    workflowName: read("WORKFLOW_NAME") ?? "futari-propose",
    workflowLocation: read("WORKFLOW_LOCATION") ?? "asia-northeast1",
    workflowInvokeSecret: read("WORKFLOW_INVOKE_SECRET"),
    publicBaseUrl: read("PUBLIC_BASE_URL"),
    mockAuthSecret: read("MOCK_AUTH_SECRET") ?? "dev-only-change-me",
    cookieSecure: readBool("COOKIE_SECURE", onCloudRun),
    port: readNumber("PORT", 3000),
    timeZone: TIME_ZONE,
    onCloudRun,
    uiFixtures,
    firestoreNamespace: read("FIRESTORE_NAMESPACE"),
    /** Phase 2a ops guardrails — defaults from settings; env can tighten for staging. */
    rateLimits: {
      places_search: {
        perMinute: Math.max(1, readNumber("RATE_LIMIT_PLACES_SEARCH_PER_MINUTE", RATE_LIMITS.places_search.perMinute)),
        perDay: Math.max(1, readNumber("RATE_LIMIT_PLACES_SEARCH_PER_DAY", RATE_LIMITS.places_search.perDay)),
      },
      session_create: {
        perMinute: Math.max(1, readNumber("RATE_LIMIT_SESSION_CREATE_PER_MINUTE", RATE_LIMITS.session_create.perMinute)),
        perDay: Math.max(1, readNumber("RATE_LIMIT_SESSION_CREATE_PER_DAY", RATE_LIMITS.session_create.perDay)),
      },
      run_start: {
        perMinute: Math.max(1, readNumber("RATE_LIMIT_RUN_START_PER_MINUTE", RATE_LIMITS.run_start.perMinute)),
        perDay: Math.max(1, readNumber("RATE_LIMIT_RUN_START_PER_DAY", RATE_LIMITS.run_start.perDay)),
      },
      reflect: {
        perMinute: Math.max(1, readNumber("RATE_LIMIT_REFLECT_PER_MINUTE", RATE_LIMITS.reflect.perMinute)),
        perDay: Math.max(1, readNumber("RATE_LIMIT_REFLECT_PER_DAY", RATE_LIMITS.reflect.perDay)),
      },
    },
    apiBudgets: {
      places: Math.max(1, readNumber("API_BUDGET_PLACES_PER_DAY", API_BUDGETS.places)),
      routes: Math.max(1, readNumber("API_BUDGET_ROUTES_PER_DAY", API_BUDGETS.routes)),
      llm_mundane: Math.max(1, readNumber("API_BUDGET_LLM_MUNDANE_PER_DAY", API_BUDGETS.llm_mundane)),
      llm_hard: Math.max(1, readNumber("API_BUDGET_LLM_HARD_PER_DAY", API_BUDGETS.llm_hard)),
      llm_search: Math.max(1, readNumber("API_BUDGET_LLM_SEARCH_PER_DAY", API_BUDGETS.llm_search)),
    },
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
    item: "発表会場の住所は未提供。検索中心は東京駅周辺（会場そのものではない）",
    status: "BLOCKED",
  });
  return items;
}
