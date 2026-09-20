import { getEnv } from "@/config/env";
import {
  CACHE_TTL_MS,
  PLACES_FIELD_MASK_DETAILS,
  PLACES_FIELD_MASK_SEARCH,
  ROUTES_FIELD_MASK,
} from "@/config/settings";
import type {
  Evidence,
  OpeningAssessment,
  SourceKind,
  Spot,
  TravelMode,
} from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { realNowIso, toTokyoParts } from "@/lib/time";
import { getCatalogSpot, MOCK_CATALOG, searchCatalog, type CatalogSpot } from "./catalog";
import { getEvent, getVenue } from "@/server/catalog/repo";
import { catalogEventToSpot, venueHours } from "@/server/catalog/toSpot";
import type { ScenarioOverlay } from "@/domain/schemas";
import {
  assessHours,
  parsePlaceHours,
  parseYenRange,
  type PlaceHoursRule,
} from "./placeFacts";

export type { PlaceHoursRule };

export type ProviderCtx = {
  runId: string;
  overlays: ScenarioOverlay[];
  cache: Map<string, { at: string; value: unknown; stale: boolean }>;
  httpAttempts: number;
  onHttp: (info: { provider: string; cacheHit: boolean; attempt: number }) => void | Promise<void>;
  placeHours?: Record<string, PlaceHoursRule[]>;
};

function evidence(partial: Omit<Evidence, "id"> & { id?: string }): Evidence {
  return { id: partial.id ?? newId("ev"), ...partial };
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function cacheGet<T>(ctx: ProviderCtx, key: string, ttlMs: number): T | null {
  const hit = ctx.cache.get(key);
  if (!hit) return null;
  const age = Date.now() - new Date(hit.at).getTime();
  hit.stale = age > ttlMs;
  return hit.value as T;
}

function cacheSet(ctx: ProviderCtx, key: string, value: unknown) {
  ctx.cache.set(key, { at: realNowIso(), value, stale: false });
}

async function counted<T>(
  ctx: ProviderCtx,
  provider: string,
  fn: () => Promise<T>,
): Promise<T> {
  ctx.httpAttempts += 1;
  await ctx.onHttp({ provider, cacheHit: false, attempt: ctx.httpAttempts });
  return fn();
}

function toSpot(c: CatalogSpot): Spot {
  return {
    id: c.id,
    name: c.name,
    lat: c.lat,
    lng: c.lng,
    categories: c.categories,
    environment: {
      value: c.environment.value,
      evidenceIds: c.environment.evidenceIds,
    },
    costForTwoJpy: c.costForTwoJpy,
    restEase: {
      value: c.restEase.value,
      evidenceIds: c.restEase.evidenceIds,
    },
    standingBurden: {
      value: c.standingBurden.value,
      evidenceIds: c.standingBurden.evidenceIds.map((id) => id),
    },
    officialUrl: c.officialUrl,
  };
}

export async function searchSpots(
  ctx: ProviderCtx,
  args: {
    area: { lat: number; lng: number; name: string };
    category: string;
    radiusMeters: number;
    rankPreference?: "POPULARITY" | "DISTANCE";
    includedTypes?: string[];
  },
): Promise<{ spots: Spot[]; evidence: Evidence[] }> {
  const env = getEnv();
  const rank = args.rankPreference ?? "POPULARITY";
  const typesKey = (args.includedTypes ?? []).join(",");
  const key = `search:${args.area.lat}:${args.area.lng}:${args.category}:${args.radiusMeters}:${rank}:${typesKey}`;
  const cached = cacheGet<{ spots: Spot[]; evidence: Evidence[] }>(ctx, key, CACHE_TTL_MS.spotBasics);
  if (cached) {
    await ctx.onHttp({ provider: env.runtime === "LIVE" ? "places" : "mock-places", cacheHit: true, attempt: ctx.httpAttempts });
    return cached;
  }
  if (env.runtime === "LIVE" && env.googleMapsApiKey) {
    const result = await counted(ctx, "places", () => liveSearch(env.googleMapsApiKey!, args));
    cacheSet(ctx, key, result);
    return result;
  }
  const result = await counted(ctx, "mock-places", async () => {
    const found = searchCatalog(args.category, args.area, args.radiusMeters).slice(0, 20);
    const evidenceList = [
      evidence({
        kind: "API",
        provider: "mock-places",
        sourceRef: args.category,
        sourceField: "search",
        fetchedAt: realNowIso(),
        validFor: null,
        note: "モックカタログ検索。LIVE の Places 応答ではない",
      }),
    ];
    return { spots: found.map(toSpot), evidence: evidenceList };
  });
  cacheSet(ctx, key, result);
  return result;
}

export type SpotDetails = {
  spot: Spot | null;
  evidence: Evidence[];
  hours: PlaceHoursRule[];
};

export async function getSpotDetails(
  ctx: ProviderCtx,
  args: { spotId: string },
): Promise<SpotDetails> {
  const env = getEnv();
  const key = `details:${args.spotId}`;
  const cached = cacheGet<SpotDetails>(ctx, key, CACHE_TTL_MS.spotBasics);
  if (cached) {
    await ctx.onHttp({ provider: "places", cacheHit: true, attempt: ctx.httpAttempts });
    return cached;
  }
  if (args.spotId.startsWith("evt_")) {
    const event = await getEvent(args.spotId);
    const dateHint = event?.dateStart ?? event?.fetchedAt.slice(0, 10) ?? "1970-01-01";
    const spot = event ? catalogEventToSpot(event, dateHint) : null;
    const venue = event?.venueId ? await getVenue(event.venueId) : null;
    const result: SpotDetails = {
      spot,
      hours: venueHours(venue),
      evidence: [
        evidence({
          kind: event ? "API" : "UNKNOWN",
          provider: "event-catalog",
          sourceRef: args.spotId,
          sourceField: "catalogEvents",
          fetchedAt: event?.fetchedAt ?? realNowIso(),
          validFor: null,
          note: event ? "カタログイベント。施設営業時間とは別" : "カタログイベントなし",
        }),
      ],
    };
    cacheSet(ctx, key, result);
    return result;
  }
  if (env.runtime === "LIVE" && env.googleMapsApiKey && !args.spotId.startsWith("mock:")) {
    const result = await counted(ctx, "places", () => liveDetails(env.googleMapsApiKey!, args.spotId));
    cacheSet(ctx, key, result);
    return result;
  }
  const result = await counted(ctx, "mock-places", async () => {
    const c = getCatalogSpot(args.spotId);
    if (!c) return { spot: null, evidence: [], hours: [] };
    return {
      spot: toSpot(c),
      hours: c.hours,
      evidence: [
        evidence({
          kind: "API",
          provider: "mock-places",
          sourceRef: c.id,
          sourceField: "details",
          fetchedAt: realNowIso(),
          validFor: null,
          note: "モック詳細",
        }),
      ],
    };
  });
  cacheSet(ctx, key, result);
  return result;
}

export async function getWeather(
  ctx: ProviderCtx,
  args: { lat: number; lng: number; at: string },
): Promise<{
  precipitationMm: number | null;
  weatherCode: number | null;
  evidence: Evidence;
  injected: boolean;
}> {
  const overlay = ctx.overlays.find((o) => o.kind === "WEATHER");
  const key = `weather:${args.lat.toFixed(3)}:${args.lng.toFixed(3)}:${args.at.slice(0, 13)}`;
  const cached = cacheGet<{
    precipitationMm: number | null;
    weatherCode: number | null;
    evidence: Evidence;
    injected: boolean;
  }>(ctx, key, CACHE_TTL_MS.weather);

  const base = cached
    ? cached
    : await counted(ctx, "open-meteo", async () => liveOrMockWeather(args));
  if (!cached) cacheSet(ctx, key, { ...base, injected: false });

  if (overlay) {
    const mm = Number(overlay.overlay.precipitationMm ?? 8);
    return {
      precipitationMm: mm,
      weatherCode: 61,
      injected: true,
      evidence: evidence({
        kind: "INJECTED",
        provider: "scenario",
        sourceRef: overlay.id,
        sourceField: "precipitationMm",
        fetchedAt: realNowIso(),
        validFor: overlay.target.from && overlay.target.to
          ? { from: overlay.target.from, to: overlay.target.to }
          : null,
        note: "シナリオ注入。監視していない天気を自動検知したわけではない",
      }),
    };
  }
  return { ...base, injected: false };
}

async function liveOrMockWeather(args: { lat: number; lng: number; at: string }) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(args.lat));
    url.searchParams.set("longitude", String(args.lng));
    url.searchParams.set("hourly", "precipitation,weather_code");
    url.searchParams.set("timezone", "Asia/Tokyo");
    url.searchParams.set("forecast_days", "7");
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = (await res.json()) as {
      hourly?: { time: string[]; precipitation: number[]; weather_code: number[] };
    };
    const hour = args.at.slice(0, 13);
    const idx = data.hourly?.time.findIndex((t) => t.startsWith(hour)) ?? -1;
    const precipitationMm = idx >= 0 ? data.hourly!.precipitation[idx] ?? null : null;
    const weatherCode = idx >= 0 ? data.hourly!.weather_code[idx] ?? null : null;
    return {
      precipitationMm,
      weatherCode,
      injected: false,
      evidence: evidence({
        kind: "API",
        provider: "open-meteo",
        sourceRef: `${args.lat},${args.lng}`,
        sourceField: "hourly.precipitation",
        fetchedAt: realNowIso(),
        validFor: null,
        note: "Open-Meteo /v1/forecast。予報範囲は最大16日、既定7日",
      }),
    };
  } catch {
    return {
      precipitationMm: 0,
      weatherCode: 1,
      injected: false,
      evidence: evidence({
        kind: "API",
        provider: "mock-weather",
        sourceRef: `${args.lat},${args.lng}`,
        sourceField: "precipitation",
        fetchedAt: realNowIso(),
        validFor: null,
        note: "Open-Meteo に届かなかったためモック晴天。LIVE合格には使わない",
      }),
    };
  }
}

export async function estimateTravel(
  ctx: ProviderCtx,
  args: {
    from: { lat: number; lng: number; spotId?: string | null };
    to: { lat: number; lng: number; spotId?: string | null };
    mode: TravelMode;
    departureAt: string;
  },
): Promise<{
  durationMinutes: number | null;
  distanceMeters: number | null;
  evidence: Evidence;
  kind: SourceKind;
  delayMinutes: number;
}> {
  const delayOverlay = ctx.overlays.find(
    (o) =>
      o.kind === "TRAVEL_DELAY" &&
      (!o.target.spotId ||
        o.target.spotId === args.to.spotId ||
        o.target.spotId === args.from.spotId),
  );
  const delayMinutes = delayOverlay ? Number(delayOverlay.overlay.delayMinutes ?? 25) : 0;
  const env = getEnv();
  const day = toTokyoParts(args.departureAt).date;
  const key = `travel:${args.from.lat}:${args.from.lng}:${args.to.lat}:${args.to.lng}:${args.mode}:${day}`;
  const cached = cacheGet<{
    durationMinutes: number | null;
    distanceMeters: number | null;
    evidence: Evidence;
    kind: SourceKind;
  }>(ctx, key, CACHE_TTL_MS.travel);

  let base = cached;
  if (!base) {
    if (env.runtime === "LIVE" && env.googleMapsApiKey) {
      base = await liveRouteWithFallback(ctx, env.googleMapsApiKey, args);
    } else {
      base = await counted(ctx, "mock-routes", async () => {
        const meters = haversineMeters(args.from, args.to);
        const speed = args.mode === "WALK" ? 80 : args.mode === "TRANSIT" ? 250 : 400;
        return {
          durationMinutes: Math.max(5, Math.round(meters / speed)),
          distanceMeters: Math.round(meters),
          kind: "API" as const,
          evidence: evidence({
            kind: "API",
            provider: "mock-routes",
            sourceRef: `${args.from.lat},${args.from.lng}->${args.to.lat},${args.to.lng}`,
            sourceField: "duration",
            fetchedAt: realNowIso(),
            validFor: null,
            note: "モック経路。LIVEでは Routes 失敗時に直線距離を実移動時間として使わない",
          }),
        };
      });
    }
    cacheSet(ctx, key, base);
  } else {
    await ctx.onHttp({ provider: "routes", cacheHit: true, attempt: ctx.httpAttempts });
  }

  if (delayOverlay) {
    return {
      ...base,
      delayMinutes,
      evidence: evidence({
        kind: "INJECTED",
        provider: "scenario",
        sourceRef: delayOverlay.id,
        sourceField: "delayMinutes",
        fetchedAt: realNowIso(),
        validFor: null,
        note: "移動遅延の注入。実測の遅延検知ではない",
      }),
    };
  }
  return { ...base, delayMinutes: 0 };
}

export async function checkOpen(
  ctx: ProviderCtx,
  args: { spotId: string; startAt: string; endAt: string },
): Promise<OpeningAssessment> {
  const env = getEnv();
  const key = `open:${args.spotId}:${args.startAt}:${args.endAt}`;
  const cached = cacheGet<OpeningAssessment>(ctx, key, CACHE_TTL_MS.opening);
  if (cached) {
    await ctx.onHttp({ provider: "places", cacheHit: true, attempt: ctx.httpAttempts });
    return cached;
  }
  const full = ctx.overlays.find(
    (o) => o.kind === "SPOT_FULL" && o.target.spotId === args.spotId,
  );
  const result = await counted(ctx, env.runtime === "LIVE" ? "places" : "mock-places", async () => {
    const hours = ctx.placeHours?.[args.spotId] ?? getCatalogSpot(args.spotId)?.hours;
    const state = assessHours(hours, args.startAt, args.endAt, toTokyoParts);
    return {
      spotId: args.spotId,
      startAt: args.startAt,
      endAt: args.endAt,
      state,
      evidenceIds: state === "UNKNOWN" ? [] : [`open-${args.spotId}`],
    };
  });
  if (full) {
    result.state = result.state === "CLOSED" ? "CLOSED" : result.state;
  }
  cacheSet(ctx, key, result);
  return result;
}

async function liveSearch(
  apiKey: string,
  args: {
    area: { lat: number; lng: number };
    category: string;
    radiusMeters: number;
    rankPreference?: "POPULARITY" | "DISTANCE";
    includedTypes?: string[];
  },
): Promise<{ spots: Spot[]; evidence: Evidence[] }> {
  const includedTypes = args.includedTypes?.length ? args.includedTypes : categoryToPlaceTypes(args.category);
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK_SEARCH,
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 20,
      languageCode: "ja",
      ...(args.rankPreference === "DISTANCE" ? { rankPreference: "DISTANCE" } : {}),
      locationRestriction: {
        circle: {
          center: { latitude: args.area.lat, longitude: args.area.lng },
          radius: args.radiusMeters,
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 180);
    throw new Error(`places searchNearby ${res.status} ${args.category} ${detail}`);
  }
  const data = (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text: string };
      location?: { latitude: number; longitude: number };
      types?: string[];
      primaryType?: string;
      googleMapsUri?: string;
    }[];
  };
  const fetchedAt = realNowIso();
  const spots: Spot[] = (data.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? p.id,
    lat: p.location?.latitude ?? 0,
    lng: p.location?.longitude ?? 0,
    categories: p.types ?? (p.primaryType ? [p.primaryType] : []),
    environment: { value: null, evidenceIds: [] },
    costForTwoJpy: { value: null, evidenceIds: [] },
    restEase: { value: null, evidenceIds: [] },
    standingBurden: { value: null, evidenceIds: [] },
    officialUrl: null,
  }));
  return {
    spots,
    evidence: [
      evidence({
        kind: "API",
        provider: "places",
        sourceRef: "places:searchNearby",
        sourceField: "places",
        fetchedAt,
        validFor: null,
        note: "Places Nearby Search (New)。FieldMask 最小",
      }),
    ],
  };
}

async function liveDetails(apiKey: string, spotId: string): Promise<SpotDetails> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(spotId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK_DETAILS,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`places details ${res.status}`);
  const p = (await res.json()) as {
    id: string;
    displayName?: { text: string };
    location?: { latitude: number; longitude: number };
    types?: string[];
    websiteUri?: string;
    regularOpeningHours?: {
      periods?: {
        open?: { day?: number; hour?: number; minute?: number };
        close?: { day?: number; hour?: number; minute?: number };
      }[];
    };
    priceRange?: {
      startPrice?: { currencyCode?: string; units?: string };
      endPrice?: { currencyCode?: string; units?: string };
    };
  };
  const fetchedAt = realNowIso();
  const envEst = estimateEnvironment(p.types ?? []);
  const hours = parsePlaceHours(p.regularOpeningHours);
  const yen = parseYenRange(p.priceRange);
  const costEvidence = evidence({
    kind: yen ? "API" : "UNKNOWN",
    provider: "places",
    sourceRef: p.id,
    sourceField: yen ? "priceRange" : "details",
    fetchedAt,
    validFor: null,
    note: yen ? "Places priceRange（JPY）。人数内訳は未確認" : "Place Details (New)。円額なし",
  });
  return {
    hours,
    spot: {
      id: p.id,
      name: p.displayName?.text ?? p.id,
      lat: p.location?.latitude ?? 0,
      lng: p.location?.longitude ?? 0,
      categories: p.types ?? [],
      environment: envEst,
      costForTwoJpy: { value: yen, evidenceIds: yen ? [costEvidence.id] : [] },
      restEase: estimateRest(p.types ?? []),
      standingBurden: estimateStanding(p.types ?? []),
      officialUrl: p.websiteUri ?? null,
    },
    evidence: [
      evidence({
        kind: "API",
        provider: "places",
        sourceRef: p.id,
        sourceField: "details",
        fetchedAt,
        validFor: null,
        note: hours.length ? "Place Details (New)。営業時間あり" : "Place Details (New)。営業時間なし",
      }),
      costEvidence,
    ],
  };
}

type RouteEstimate = {
  durationMinutes: number | null;
  distanceMeters: number | null;
  evidence: Evidence;
  kind: SourceKind;
};

async function liveRouteWithFallback(
  ctx: ProviderCtx,
  apiKey: string,
  args: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    mode: TravelMode;
    departureAt: string;
  },
): Promise<RouteEstimate> {
  const departureAt = clampDeparture(args.departureAt);
  const modes: TravelMode[] = [];
  for (const mode of [args.mode, "WALK", "DRIVE"] as TravelMode[]) {
    if (!modes.includes(mode)) modes.push(mode);
  }
  let last: RouteEstimate | null = null;
  for (const mode of modes) {
    last = await counted(ctx, "routes", () => liveRoute(apiKey, { ...args, mode, departureAt }));
    if (last.durationMinutes != null) {
      if (mode !== args.mode || departureAt !== args.departureAt) {
        last = {
          ...last,
          evidence: {
            ...last.evidence,
            note: `Routes ${mode}${departureAt !== args.departureAt ? "（出発を現在以降に補正）" : ""}`,
          },
        };
      }
      return last;
    }
  }
  return last!;
}

function clampDeparture(iso: string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return realNowIso();
  if (at >= Date.now() - 30_000) return iso;
  return realNowIso();
}

async function liveRoute(
  apiKey: string,
  args: {
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    mode: TravelMode;
    departureAt: string;
  },
): Promise<{
  durationMinutes: number | null;
  distanceMeters: number | null;
  evidence: Evidence;
  kind: SourceKind;
}> {
  const travelMode = args.mode === "WALK" ? "WALK" : args.mode === "TRANSIT" ? "TRANSIT" : "DRIVE";
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTES_FIELD_MASK,
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: args.from.lat, longitude: args.from.lng } } },
      destination: { location: { latLng: { latitude: args.to.lat, longitude: args.to.lng } } },
      travelMode,
      languageCode: "ja",
      departureTime: args.departureAt,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    return {
      durationMinutes: null,
      distanceMeters: null,
      kind: "UNKNOWN",
      evidence: evidence({
        kind: "UNKNOWN",
        provider: "routes",
        sourceRef: null,
        sourceField: "duration",
        fetchedAt: realNowIso(),
        validFor: null,
        note: `Routes 失敗 (${res.status})。直線距離では代用しない`,
      }),
    };
  }
  const data = (await res.json()) as {
    routes?: { duration?: string; distanceMeters?: number }[];
  };
  const route = data.routes?.[0];
  const seconds = route?.duration ? Number(route.duration.replace("s", "")) : null;
  return {
    durationMinutes: seconds != null ? Math.round(seconds / 60) : null,
    distanceMeters: route?.distanceMeters ?? null,
    kind: "API",
    evidence: evidence({
      kind: "API",
      provider: "routes",
      sourceRef: "computeRoutes",
      sourceField: "duration",
      fetchedAt: realNowIso(),
      validFor: null,
      note: "Routes API computeRoutes",
    }),
  };
}

function categoryToPlaceTypes(category: string): string[] {
  if (/公園|park/.test(category) && !/名所|tourist/.test(category)) return ["park"];
  if (/散歩|walk|屋外|名所/.test(category)) return ["tourist_attraction"];
  if (/美術館|gallery/.test(category)) return ["art_gallery"];
  if (/展示|museum|博物館/.test(category)) return ["museum"];
  if (/菓子|bakery/.test(category)) return ["bakery"];
  if (/甘い|cafe|スイーツ|カフェ/.test(category)) return ["cafe"];
  if (/書店|本/.test(category)) return ["bookstore"];
  if (/図書館/.test(category)) return ["library"];
  if (/買い物|mall/.test(category)) return ["shopping_mall"];
  return ["tourist_attraction"];
}

function estimateEnvironment(types: string[]): Spot["environment"] {
  if (types.some((t) => ["park", "zoo"].includes(t))) {
    return { value: "OUTDOOR", evidenceIds: [] };
  }
  if (types.some((t) => ["museum", "art_gallery", "cafe", "shopping_mall"].includes(t))) {
    return { value: "INDOOR", evidenceIds: [] };
  }
  return { value: null, evidenceIds: [] };
}

function estimateRest(types: string[]): Spot["restEase"] {
  if (types.includes("cafe")) return { value: "EASY", evidenceIds: [] };
  if (types.includes("museum") || types.includes("art_gallery")) {
    return { value: "LIMITED", evidenceIds: [] };
  }
  return { value: null, evidenceIds: [] };
}

function estimateStanding(types: string[]): Spot["standingBurden"] {
  if (types.includes("cafe")) return { value: "LOW", evidenceIds: [] };
  if (types.includes("art_gallery") || types.includes("museum")) {
    return { value: "HIGH", evidenceIds: [] };
  }
  return { value: null, evidenceIds: [] };
}

export function listMockSpots(): Spot[] {
  return MOCK_CATALOG.map(toSpot);
}
