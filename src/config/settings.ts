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
  maxConcurrentRunsPerSession: 1,
  maxRunsPerCouplePerDay: 20,
  maxInputChars: 2000,
  llmOutputRepairAttempts: 1,
  ingestMaxEvents: 10,
  sourceFetchTimeoutMs: 8_000,
  sourceFetchMaxBytes: 512_000,
} as const;

export const DEADLINES_MS = {
  INITIAL_PLAN: 60_000,
  REPLAN: 30_000,
  REFLECTION: 10_000,
  NEXT_PLAN: 60_000,
} as const;

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

/** 版付き料金表。実請求は OrcaRouter の usage.cost_usd を優先する */
export const LLM_PRICE_TABLE = {
  version: "2026-09-01-config",
  usdPer1M: {
    "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
    "openai/gpt-4o": { input: 2.5, output: 10 },
  },
} as const;

export const MODEL_PARAMS = {
  temperature: 0.2,
  maxTokens: 2000,
} as const;

export const PLACES_FIELD_MASK_SEARCH =
  "places.id,places.displayName,places.location,places.types,places.primaryType,places.googleMapsUri";

export const PLACES_FIELD_MASK_DETAILS =
  "id,displayName,location,types,primaryType,websiteUri,googleMapsUri,regularOpeningHours,currentOpeningHours,priceLevel,priceRange,businessStatus";

export const ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters";
