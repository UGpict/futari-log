import { ROUTES_FIELD_MASK, ROUTES_FIELD_MASK_TRANSIT, TRAVEL_BUFFER_MINUTES } from "@/config/settings";
import type { Evidence, SourceKind, TravelMode } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";

export type RoutePoint = { lat: number; lng: number; spotId?: string | null };

export type RouteFailure =
  | "NO_ROUTE"
  | "PERMISSION"
  | "API_DISABLED"
  | "QUOTA"
  | "TIMEOUT"
  | "INVALID"
  | "NETWORK"
  | "MISSING_KEY";

export type DepartureAdjustment = {
  requestedDepartureAt: string;
  effectiveDepartureAt: string;
  adjusted: boolean;
  reason: "PAST" | "TOO_SOON" | "INVALID" | null;
};

export type RouteAttempt = {
  via: "placeId" | "latLng";
  mode: TravelMode;
  departureAt: string | null;
  httpStatus: number | null;
  googleStatus: string | null;
  googleMessage: string | null;
  routeCount: number;
  failure: RouteFailure | null;
  durationMinutes: number | null;
};

export type RouteEstimate = {
  durationMinutes: number | null;
  distanceMeters: number | null;
  /** TRANSIT の徒歩内訳。未取得は null（0 にしない）。WALK では duration と同じ */
  walkMinutesWithin: number | null;
  bufferMinutes: number;
  evidence: Evidence;
  kind: SourceKind;
  failure: RouteFailure | null;
  cached: boolean;
  requestedDepartureAt: string | null;
  effectiveDepartureAt: string | null;
  departureAdjusted: boolean;
  attempts: RouteAttempt[];
};

export type ComputeRoutesBody = {
  origin: Record<string, unknown>;
  destination: Record<string, unknown>;
  travelMode: "WALK" | "DRIVE" | "TRANSIT";
  languageCode: "ja";
  regionCode?: "JP";
  departureTime?: string;
  routingPreference?: "TRAFFIC_AWARE" | "TRAFFIC_AWARE_OPTIMAL" | "TRAFFIC_UNAWARE";
};

export function travelBufferMinutes(mode: TravelMode): number {
  return TRAVEL_BUFFER_MINUTES[mode];
}

/** 車・公共交通。予定出発が未来ならそのまま。過去・直近だけ実リクエストを現在+60秒へ補正する */
export function scheduleDriveDeparture(requested: string, nowMs = Date.now()): DepartureAdjustment {
  const minFuture = nowMs + 60_000;
  const at = new Date(requested).getTime();
  if (!Number.isFinite(at)) {
    return {
      requestedDepartureAt: requested,
      effectiveDepartureAt: new Date(minFuture).toISOString(),
      adjusted: true,
      reason: "INVALID",
    };
  }
  const requestedIso = new Date(at).toISOString();
  if (at < nowMs) {
    return {
      requestedDepartureAt: requestedIso,
      effectiveDepartureAt: new Date(minFuture).toISOString(),
      adjusted: true,
      reason: "PAST",
    };
  }
  if (at < minFuture) {
    return {
      requestedDepartureAt: requestedIso,
      effectiveDepartureAt: new Date(minFuture).toISOString(),
      adjusted: true,
      reason: "TOO_SOON",
    };
  }
  return {
    requestedDepartureAt: requestedIso,
    effectiveDepartureAt: requestedIso,
    adjusted: false,
    reason: null,
  };
}

export function futureDepartureIso(iso: string, nowMs = Date.now()): string {
  return scheduleDriveDeparture(iso, nowMs).effectiveDepartureAt;
}

export function waypointFromPoint(point: RoutePoint): Record<string, unknown> {
  if (point.spotId && !point.spotId.startsWith("mock:")) {
    return { placeId: point.spotId };
  }
  return {
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  };
}

export function buildComputeRoutesBody(args: {
  from: RoutePoint;
  to: RoutePoint;
  mode: TravelMode;
  departureAt: string;
  nowMs?: number;
}): { body: ComputeRoutesBody; departure: DepartureAdjustment | null } {
  const origin = waypointFromPoint(args.from);
  const destination = waypointFromPoint(args.to);
  const travelMode = args.mode === "WALK" ? "WALK" : args.mode === "TRANSIT" ? "TRANSIT" : "DRIVE";
  const body: ComputeRoutesBody = {
    origin,
    destination,
    travelMode,
    languageCode: "ja",
    regionCode: "JP",
  };
  if (travelMode === "WALK") return { body, departure: null };
  if (travelMode === "DRIVE") {
    const departure = scheduleDriveDeparture(args.departureAt, args.nowMs);
    body.routingPreference = "TRAFFIC_AWARE";
    body.departureTime = departure.effectiveDepartureAt;
    return { body, departure };
  }
  // TRANSIT: past/too-soon departure often yields empty routes; bump like DRIVE.
  const departure = scheduleDriveDeparture(args.departureAt, args.nowMs);
  body.departureTime = departure.effectiveDepartureAt;
  return { body, departure };
}

export function parseDurationSeconds(raw: unknown): number | null {
  if (typeof raw === "string") {
    const match = raw.match(/^([0-9]+(?:\.[0-9]+)?)s$/);
    if (!match) return null;
    const n = Number(match[1]);
    return Number.isFinite(n) ? n : null;
  }
  if (raw && typeof raw === "object" && "seconds" in raw) {
    const n = Number((raw as { seconds: unknown }).seconds);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function clipMessage(msg: string, max = 160): string {
  const cleaned = msg.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

export function classifyRoutesFailure(
  httpStatus: number,
  body: { error?: { status?: string; message?: string } },
): { failure: RouteFailure; note: string } {
  const gStatus = body.error?.status ?? "";
  const msg = body.error?.message ?? "";
  const combined = `${gStatus} ${msg}`;
  const detail = [gStatus || null, msg ? clipMessage(msg) : null].filter(Boolean).join(": ");
  if (httpStatus === 429 || gStatus === "RESOURCE_EXHAUSTED" || /quota/i.test(combined)) {
    return {
      failure: "QUOTA",
      note: `Routes 利用上限 (HTTP ${httpStatus}${detail ? `, ${detail}` : ""})。直線距離では代用しない`,
    };
  }
  if (httpStatus === 403 || gStatus === "PERMISSION_DENIED") {
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
      return { failure: "API_DISABLED", note: "Routes API が未有効。直線距離では代用しない" };
    }
    return {
      failure: "PERMISSION",
      note: `Routes 権限不足 (HTTP ${httpStatus}${detail ? `, ${detail}` : ""})。直線距離では代用しない`,
    };
  }
  if (httpStatus === 404 || gStatus === "NOT_FOUND") {
    return {
      failure: "NO_ROUTE",
      note: `Routes 経路なし（地点が見つからない。HTTP ${httpStatus}${detail ? `, ${detail}` : ""}）。直線距離では代用しない`,
    };
  }
  if (httpStatus === 400 || gStatus === "INVALID_ARGUMENT") {
    return {
      failure: "INVALID",
      note: `Routes 不正リクエスト (HTTP ${httpStatus}${detail ? `, ${detail}` : ""})。直線距離では代用しない`,
    };
  }
  if (httpStatus >= 500) {
    return {
      failure: "INVALID",
      note: `Routes 不正レスポンス (HTTP ${httpStatus}${detail ? `, ${detail}` : ""})。直線距離では代用しない`,
    };
  }
  return {
    failure: "INVALID",
    note: `Routes 失敗 (HTTP ${httpStatus}${detail ? `, ${detail}` : ""})。直線距離では代用しない`,
  };
}

function evidenceOf(partial: Omit<Evidence, "id">): Evidence {
  return { id: newId("ev"), ...partial };
}

function departureFields(departure: DepartureAdjustment | null): Pick<
  RouteEstimate,
  "requestedDepartureAt" | "effectiveDepartureAt" | "departureAdjusted"
> {
  return {
    requestedDepartureAt: departure?.requestedDepartureAt ?? null,
    effectiveDepartureAt: departure?.effectiveDepartureAt ?? null,
    departureAdjusted: Boolean(departure?.adjusted),
  };
}

function formatAttempts(attempts: RouteAttempt[]): string {
  if (!attempts.length) return "";
  return attempts
    .map((a, i) => {
      const parts = [
        `#${i + 1}`,
        a.via,
        `mode=${a.mode}`,
        a.httpStatus != null ? `HTTP ${a.httpStatus}` : "HTTP —",
        a.googleStatus ? `status=${a.googleStatus}` : null,
        a.googleMessage ? `msg=${clipMessage(a.googleMessage, 80)}` : null,
        `routes=${a.routeCount}`,
        a.failure ? `fail=${a.failure}` : "ok",
        a.durationMinutes != null ? `${a.durationMinutes}分` : null,
      ].filter(Boolean);
      return parts.join(" ");
    })
    .join(" / ");
}

function unknownEstimate(args: {
  failure: RouteFailure;
  note: string;
  bufferMinutes: number;
  departure: DepartureAdjustment | null;
  attempts: RouteAttempt[];
}): RouteEstimate {
  const attemptNote = formatAttempts(args.attempts);
  return {
    durationMinutes: null,
    distanceMeters: null,
    walkMinutesWithin: null,
    bufferMinutes: args.bufferMinutes,
    kind: "UNKNOWN",
    failure: args.failure,
    cached: false,
    attempts: args.attempts,
    ...departureFields(args.departure),
    evidence: evidenceOf({
      kind: "UNKNOWN",
      provider: "routes",
      sourceRef: "computeRoutes",
      sourceField: "duration",
      fetchedAt: realNowIso(),
      validFor: null,
      note: attemptNote ? `${args.note}［試行: ${attemptNote}］` : args.note,
    }),
  };
}

function departureNote(departure: DepartureAdjustment | null): string {
  if (!departure?.adjusted) return "";
  const why =
    departure.reason === "PAST"
      ? "過去のため"
      : departure.reason === "TOO_SOON"
        ? "直近のため"
        : "不正な時刻のため";
  return ` 出発 ${departure.requestedDepartureAt} → 実リクエスト ${departure.effectiveDepartureAt}（${why}補正）`;
}

function attemptVia(from: RoutePoint, to: RoutePoint): "placeId" | "latLng" {
  const usedPlace =
    Boolean(from.spotId && !from.spotId.startsWith("mock:")) ||
    Boolean(to.spotId && !to.spotId.startsWith("mock:"));
  return usedPlace ? "placeId" : "latLng";
}

function sumTransitWalkMinutes(route: {
  legs?: {
    steps?: { travelMode?: string; staticDuration?: unknown; duration?: unknown }[];
  }[];
} | undefined): number | null {
  const steps = route?.legs?.flatMap((leg) => leg.steps ?? []) ?? [];
  if (!steps.length) return null;
  let totalSeconds = 0;
  let sawWalk = false;
  for (const step of steps) {
    if (step.travelMode !== "WALK") continue;
    sawWalk = true;
    const seconds = parseDurationSeconds(step.staticDuration ?? step.duration);
    if (seconds == null) return null;
    totalSeconds += seconds;
  }
  if (!sawWalk) return 0;
  return Math.max(0, Math.round(totalSeconds / 60));
}

export async function computeLiveRoute(args: {
  apiKey: string;
  from: RoutePoint;
  to: RoutePoint;
  mode: TravelMode;
  departureAt: string;
}): Promise<RouteEstimate> {
  const bufferMinutes = travelBufferMinutes(args.mode);
  const attempts: RouteAttempt[] = [];
  const fieldMask = args.mode === "TRANSIT" ? ROUTES_FIELD_MASK_TRANSIT : ROUTES_FIELD_MASK;

  const attempt = async (from: RoutePoint, to: RoutePoint): Promise<RouteEstimate> => {
    const via = attemptVia(from, to);
    const built = buildComputeRoutesBody({ from, to, mode: args.mode, departureAt: args.departureAt });
    let res: Response;
    try {
      res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": args.apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const failure: RouteFailure = timeout ? "TIMEOUT" : "NETWORK";
      attempts.push({
        via,
        mode: args.mode,
        departureAt: built.departure?.effectiveDepartureAt ?? null,
        httpStatus: null,
        googleStatus: null,
        googleMessage: null,
        routeCount: 0,
        failure,
        durationMinutes: null,
      });
      return unknownEstimate({
        failure,
        note: timeout
          ? "Routes タイムアウト。直線距離では代用しない"
          : "Routes に届かない。直線距離では代用しない",
        bufferMinutes,
        departure: built.departure,
        attempts,
      });
    }
    const text = await res.text().catch(() => "");
    let json: {
      error?: { status?: string; message?: string };
      routes?: {
        duration?: unknown;
        distanceMeters?: number;
        legs?: {
          steps?: { travelMode?: string; staticDuration?: unknown; duration?: unknown }[];
        }[];
      }[];
    } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      json = {};
    }
    const googleStatus = json.error?.status ?? null;
    const googleMessage = json.error?.message ?? null;
    const routeCount = Array.isArray(json.routes) ? json.routes.length : 0;

    if (!res.ok) {
      const classified = classifyRoutesFailure(res.status, json);
      attempts.push({
        via,
        mode: args.mode,
        departureAt: built.departure?.effectiveDepartureAt ?? null,
        httpStatus: res.status,
        googleStatus,
        googleMessage,
        routeCount,
        failure: classified.failure,
        durationMinutes: null,
      });
      return unknownEstimate({ ...classified, bufferMinutes, departure: built.departure, attempts });
    }

    const route = json.routes?.[0];
    const seconds = parseDurationSeconds(route?.duration);
    const distanceMeters = route?.distanceMeters ?? null;
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
      attempts.push({
        via,
        mode: args.mode,
        departureAt: built.departure?.effectiveDepartureAt ?? null,
        httpStatus: res.status,
        googleStatus,
        googleMessage,
        routeCount,
        failure: "NO_ROUTE",
        durationMinutes: null,
      });
      return unknownEstimate({
        failure: "NO_ROUTE",
        note:
          routeCount === 0
            ? `Routes 経路なし（HTTP ${res.status}、routes 空、mode=${args.mode}）。直線距離では代用しない`
            : `Routes 経路なし（HTTP ${res.status}、routes=${routeCount} だが duration なし、mode=${args.mode}）。直線距離では代用しない`,
        bufferMinutes,
        departure: built.departure,
        attempts,
      });
    }
    const minutes = Math.max(1, Math.round(seconds / 60));
    const walkMinutesWithin =
      args.mode === "WALK" ? minutes : args.mode === "TRANSIT" ? sumTransitWalkMinutes(route) : 0;
    const walkNote =
      args.mode === "TRANSIT"
        ? walkMinutesWithin != null
          ? `うち徒歩 ${walkMinutesWithin}分（乗車は徒歩に含めない）`
          : "徒歩内訳は未取得（0分扱いにはしない）"
        : null;
    attempts.push({
      via,
      mode: args.mode,
      departureAt: built.departure?.effectiveDepartureAt ?? null,
      httpStatus: res.status,
      googleStatus,
      googleMessage,
      routeCount,
      failure: null,
      durationMinutes: minutes,
    });
    return {
      durationMinutes: minutes,
      distanceMeters,
      walkMinutesWithin,
      bufferMinutes,
      kind: "API",
      failure: null,
      cached: false,
      attempts,
      ...departureFields(built.departure),
      evidence: evidenceOf({
        kind: "API",
        provider: "routes",
        sourceRef: "computeRoutes",
        sourceField: "duration",
        fetchedAt: realNowIso(),
        validFor: null,
        note: `Routes API ${args.mode} 予測 ${minutes}分。余裕 ${bufferMinutes}分はアプリ加算${walkNote ? `。${walkNote}` : ""}${departureNote(built.departure)}［試行: ${formatAttempts(attempts)}］`,
      }),
    };
  };

  const first = await attempt(args.from, args.to);
  const usedPlace =
    Boolean(args.from.spotId && !args.from.spotId.startsWith("mock:")) ||
    Boolean(args.to.spotId && !args.to.spotId.startsWith("mock:"));
  if ((first.failure === "NO_ROUTE" || first.failure === "INVALID") && usedPlace) {
    const retry = await attempt(
      { lat: args.from.lat, lng: args.from.lng },
      { lat: args.to.lat, lng: args.to.lng },
    );
    if (retry.durationMinutes != null) {
      return {
        ...retry,
        evidence: {
          ...retry.evidence,
          note: `${retry.evidence.note}（Place ID ではなく座標で再取得）`,
        },
      };
    }
    return retry;
  }
  return first;
}
