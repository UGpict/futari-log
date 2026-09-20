import { ROUTES_FIELD_MASK, TRAVEL_BUFFER_MINUTES } from "@/config/settings";
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

export type RouteEstimate = {
  durationMinutes: number | null;
  distanceMeters: number | null;
  bufferMinutes: number;
  evidence: Evidence;
  kind: SourceKind;
  failure: RouteFailure | null;
  cached: boolean;
  requestedDepartureAt: string | null;
  effectiveDepartureAt: string | null;
  departureAdjusted: boolean;
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

/** 車のみ。予定出発が未来ならそのまま。過去・直近だけ実リクエストを現在+60秒へ補正する */
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
  const at = new Date(args.departureAt).getTime();
  const requested = Number.isFinite(at) ? new Date(at).toISOString() : args.departureAt;
  body.departureTime = Number.isFinite(at) ? requested : futureDepartureIso(args.departureAt, args.nowMs);
  return {
    body,
    departure: {
      requestedDepartureAt: requested,
      effectiveDepartureAt: body.departureTime,
      adjusted: body.departureTime !== requested,
      reason: body.departureTime !== requested ? "INVALID" : null,
    },
  };
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

export function classifyRoutesFailure(
  httpStatus: number,
  body: { error?: { status?: string; message?: string } },
): { failure: RouteFailure; note: string } {
  const gStatus = body.error?.status ?? "";
  const msg = body.error?.message ?? "";
  const combined = `${gStatus} ${msg}`;
  if (httpStatus === 429 || gStatus === "RESOURCE_EXHAUSTED" || /quota/i.test(combined)) {
    return { failure: "QUOTA", note: `Routes 利用上限 (${httpStatus})。直線距離では代用しない` };
  }
  if (httpStatus === 403 || gStatus === "PERMISSION_DENIED") {
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
      return { failure: "API_DISABLED", note: "Routes API が未有効。直線距離では代用しない" };
    }
    return { failure: "PERMISSION", note: `Routes 権限不足 (${httpStatus})。直線距離では代用しない` };
  }
  if (httpStatus === 404 || gStatus === "NOT_FOUND") {
    return { failure: "NO_ROUTE", note: "Routes 経路なし（地点が見つからない）。直線距離では代用しない" };
  }
  if (httpStatus === 400 || gStatus === "INVALID_ARGUMENT") {
    return { failure: "INVALID", note: `Routes 不正レスポンス (${httpStatus})。直線距離では代用しない` };
  }
  return { failure: "INVALID", note: `Routes 失敗 (${httpStatus})。直線距離では代用しない` };
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

function unknownEstimate(args: {
  failure: RouteFailure;
  note: string;
  bufferMinutes: number;
  departure: DepartureAdjustment | null;
}): RouteEstimate {
  return {
    durationMinutes: null,
    distanceMeters: null,
    bufferMinutes: args.bufferMinutes,
    kind: "UNKNOWN",
    failure: args.failure,
    cached: false,
    ...departureFields(args.departure),
    evidence: evidenceOf({
      kind: "UNKNOWN",
      provider: "routes",
      sourceRef: "computeRoutes",
      sourceField: "duration",
      fetchedAt: realNowIso(),
      validFor: null,
      note: args.note,
    }),
  };
}

function departureNote(departure: DepartureAdjustment | null): string {
  if (!departure?.adjusted) return "";
  const why = departure.reason === "PAST" ? "過去のため" : departure.reason === "TOO_SOON" ? "直近のため" : "不正な時刻のため";
  return ` 出発 ${departure.requestedDepartureAt} → 実リクエスト ${departure.effectiveDepartureAt}（${why}補正）`;
}

export async function computeLiveRoute(args: {
  apiKey: string;
  from: RoutePoint;
  to: RoutePoint;
  mode: TravelMode;
  departureAt: string;
}): Promise<RouteEstimate> {
  const bufferMinutes = travelBufferMinutes(args.mode);
  const attempt = async (from: RoutePoint, to: RoutePoint): Promise<RouteEstimate> => {
    const built = buildComputeRoutesBody({ from, to, mode: args.mode, departureAt: args.departureAt });
    let res: Response;
    try {
      res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": args.apiKey,
          "X-Goog-FieldMask": ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(built.body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return unknownEstimate({
        failure: timeout ? "TIMEOUT" : "NETWORK",
        note: timeout ? "Routes タイムアウト。直線距離では代用しない" : "Routes に届かない。直線距離では代用しない",
        bufferMinutes,
        departure: built.departure,
      });
    }
    const text = await res.text().catch(() => "");
    let json: {
      error?: { status?: string; message?: string };
      routes?: { duration?: unknown; distanceMeters?: number }[];
    } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      json = {};
    }
    if (!res.ok) {
      const classified = classifyRoutesFailure(res.status, json);
      return unknownEstimate({ ...classified, bufferMinutes, departure: built.departure });
    }
    const route = json.routes?.[0];
    const seconds = parseDurationSeconds(route?.duration);
    const distanceMeters = route?.distanceMeters ?? null;
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
      return unknownEstimate({
        failure: "NO_ROUTE",
        note: "経路なし（HTTP 200、duration なし）。直線距離では代用しない",
        bufferMinutes,
        departure: built.departure,
      });
    }
    const minutes = Math.max(1, Math.round(seconds / 60));
    return {
      durationMinutes: minutes,
      distanceMeters,
      bufferMinutes,
      kind: "API",
      failure: null,
      cached: false,
      ...departureFields(built.departure),
      evidence: evidenceOf({
        kind: "API",
        provider: "routes",
        sourceRef: "computeRoutes",
        sourceField: "duration",
        fetchedAt: realNowIso(),
        validFor: null,
        note: `Routes API ${args.mode} 予測 ${minutes}分。余裕 ${bufferMinutes}分はアプリ加算${departureNote(built.departure)}`,
      }),
    };
  };

  const first = await attempt(args.from, args.to);
  const usedPlace =
    Boolean(args.from.spotId && !args.from.spotId.startsWith("mock:")) ||
    Boolean(args.to.spotId && !args.to.spotId.startsWith("mock:"));
  if (first.failure === "NO_ROUTE" && usedPlace) {
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
  }
  return first;
}
