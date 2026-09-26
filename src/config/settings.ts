export { TIME_ZONE, FX } from "./public";

export const APP_NAME = "ふたりログ";
export const SCHEMA_VERSION = "0.5.0";
export const PROMPT_VERSION = "0.6.0";
export const TOOL_VERSION = "0.6.2";
export const MODEL_SETTINGS_VERSION = "0.5.0";

export const LIMITS = {
  maxDecisionSteps: 8,
  maxExternalHttpAttempts: 24,
  maxConcurrentExternal: 4,
  maxSearchCandidates: 20,
  maxDetailCandidates: 6,
  /** self-correct 補充で Place Details / 営業確認する候補の上限（決定論・課金の両方）。 */
  maxSelfCorrectRefillLookups: 6,
  maxConcurrentRunsPerSession: 1,
  /** Couple-scoped run daily cap (store insertPendingRun). Distinct from API_BUDGETS. */
  maxRunsPerCouplePerDay: 20,
  maxInputChars: 2000,
  llmOutputRepairAttempts: 1,
  ingestMaxEvents: 10,
  sourceFetchTimeoutMs: 8_000,
  sourceFetchMaxBytes: 512_000,
  /** Background venue price enrichment (googleSearch). Cap so plan path stays free of LLM wait. */
  maxPriceEnrichRunsPerDay: 24,
  /** Soft USD ceiling for price enrichment searches per Tokyo day (grounded search is costly). */
  maxPriceEnrichCostUsdPerDay: 2,
} as const;

/**
 * HTTP-edge rate limits (uid preferred, else IP). Windows are Tokyo-local.
 * Env overrides live in `getEnv().rateLimits` (see src/config/env.ts).
 */
export const RATE_LIMITS = {
  places_search: { perMinute: 30, perDay: 300 },
  session_create: { perMinute: 10, perDay: 100 },
  run_start: { perMinute: 10, perDay: 40 },
  reflect: { perMinute: 20, perDay: 100 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Process-wide Tokyo-day budgets for paid external / LLM calls.
 * Enforced at provider/LLM call sites (not only HTTP edge). Over → 503 API_BUDGET_EXCEEDED.
 * Env overrides: `getEnv().apiBudgets`.
 */
export const API_BUDGETS = {
  places: 500,
  routes: 500,
  llm_mundane: 200,
  llm_hard: 100,
  llm_search: 50,
} as const;

export type ApiBudgetKind = keyof typeof API_BUDGETS;

/**
 * Process-local circuit breaker (Phase 2b).
 * Shared multi-instance state is a follow-up — see docs/ops/monitoring.md.
 */
export const CIRCUIT_BREAKER = {
  /** Consecutive provider failures in CLOSED before OPEN. */
  failureThreshold: 5,
  /** Consecutive successes in HALF_OPEN before CLOSED. */
  successThreshold: 2,
  /** Cool-down before OPEN → HALF_OPEN probe (ms). */
  openMs: 60_000,
} as const;

export type BreakerProvider = "places" | "routes" | "orcarouter";

/** Phase 1 fixture ids used by POST /api/internal/synthetic/plan-smoke (MOCK). */
export const SYNTHETIC_PLAN_SMOKE_IDS = [
  "smoke-cafe-tokyo",
  "rain-indoor-01",
  "hours-ok-catalog",
  "fixed-time-gallery",
  "outside-tokyo-nagoya",
] as const;

export const DEADLINES_MS = {
  INITIAL_PLAN: 60_000,
  REPLAN: 30_000,
  REFLECTION: 10_000,
  NEXT_PLAN: 60_000,
  /** Search + a few page fetches; align with priceEnrich MAX_MS (~90s) + margin. */
  PRICE_ENRICH: 120_000,
} as const;

/** アプリが Routes 予測に足す余裕。API の duration とは別フィールドに持つ */
export const TRAVEL_BUFFER_MINUTES = {
  WALK: 5,
  TRANSIT: 8,
  DRIVE: 5,
} as const;

/** 徒歩の確認閾値。超えたら交通手段を勝手に変えず、確認質問にする */
export const WALK_LIMITS = {
  /** 区間ごとの徒歩がこれを超えたら強制確認。設定で変更可能 */
  legMinutes: 25,
  /**
   * 表示・候補比較用の参考合計。これだけでは q_long_walk を出さない。
   * 明示的な総徒歩上限（記憶の HARD CONSTRAINT 等）があるときだけ合計で止める。
   */
  softTotalMinutes: 45,
  /** 設定上の明示ハード上限。null のときは記憶側のみ */
  hardTotalMinutes: null as number | null,
} as const;

export { SEARCH_EXPAND } from "@/contracts/serviceArea";

export const CACHE_TTL_MS = {
  spotBasics: 24 * 60 * 60 * 1000,
  weather: 24 * 60 * 60 * 1000,
  travel: 24 * 60 * 60 * 1000,
  opening: 24 * 60 * 60 * 1000,
} as const;

export const WORKER = {
  pollMs: 400,
  leaseMs: 90_000,
  heartbeatMs: 5_000,
} as const;

export const MODEL_PARAMS = {
  temperature: 0.2,
  maxTokens: 2000,
} as const;

export const PLACES_FIELD_MASK_SEARCH =
  "places.id,places.displayName,places.location,places.types,places.primaryType,places.googleMapsUri,places.photos.name,places.photos.authorAttributions";

export const PLACES_FIELD_MASK_TEXT =
  "places.id,places.displayName,places.location,places.formattedAddress,places.types";

export const PLACES_FIELD_MASK_DETAILS =
  "id,displayName,location,types,primaryType,websiteUri,googleMapsUri,regularOpeningHours,currentOpeningHours,priceLevel,priceRange,businessStatus,photos.name,photos.authorAttributions";

/** 行程写真専用。プラン生成の Details マスクには載せない */
export const PLACES_FIELD_MASK_PHOTOS = "id,googleMapsUri,photos";
export const PLACE_PHOTO_MAX_IDS = 8;
export const PLACE_PHOTO_MAX_PX = 800;
export const PLACE_PHOTO_NAME_RETRY = 1;
export const PLACE_PHOTO_FAIL_LIMIT = 2;

export const ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters";
/** TRANSIT 時のみ。駅アクセス等の徒歩内訳用。取れなければ null のまま（0分扱いにしない） */
export const ROUTES_FIELD_MASK_TRANSIT =
  "routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.duration";
