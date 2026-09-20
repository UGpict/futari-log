import { WALK_LIMITS } from "@/config/settings";
import type { Plan, Session, TravelLeg, TravelMode, WalkLongAck } from "@/domain/schemas";

export type WalkLimitResult = {
  applies: boolean;
  longestLegMinutes: number;
  totalMinutes: number;
  overLeg: boolean;
  overTotal: boolean;
  exceeds: boolean;
};

/** Cache/display jitter must not by itself revoke a session consent. */
export const WALK_ACK_SLACK_MINUTES = 2;

export type WalkAckScope = {
  dateTokyo: string;
  travelMode: string;
  meetSpotId: string | null;
  endSpotId: string | null;
  routeSpotIds: string[];
  longestLegMinutes: number;
  totalMinutes: number;
};

export function evaluateWalkLimits(
  mode: TravelMode,
  legs: Pick<TravelLeg, "mode" | "durationMinutes">[],
  limits: { legMinutes: number; totalMinutes: number } = WALK_LIMITS,
): WalkLimitResult {
  const walkLegs = mode === "WALK" ? legs.filter((leg) => leg.mode === "WALK") : [];
  const known = walkLegs
    .map((leg) => leg.durationMinutes.value)
    .filter((value): value is number => value != null);
  const longestLegMinutes = known.length ? Math.max(...known) : 0;
  const totalMinutes = known.reduce((sum, value) => sum + value, 0);
  const overLeg = longestLegMinutes > limits.legMinutes;
  const overTotal = totalMinutes > limits.totalMinutes;
  return {
    applies: mode === "WALK",
    longestLegMinutes,
    totalMinutes,
    overLeg,
    overTotal,
    exceeds: mode === "WALK" && known.length > 0 && (overLeg || overTotal),
  };
}

export function encodeWalkAckScope(scope: WalkAckScope): string {
  return JSON.stringify({
    dateTokyo: scope.dateTokyo,
    travelMode: scope.travelMode,
    meetSpotId: scope.meetSpotId ?? "",
    endSpotId: scope.endSpotId ?? "",
    routeSpotIds: scope.routeSpotIds,
    longestLegMinutes: scope.longestLegMinutes,
    totalMinutes: scope.totalMinutes,
  });
}

export function parseWalkAckScope(raw: string | null | undefined): WalkAckScope | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WalkAckScope> & { spotIds?: string[] };
    if (parsed && typeof parsed.dateTokyo === "string") {
      return {
        dateTokyo: parsed.dateTokyo,
        travelMode: String(parsed.travelMode ?? ""),
        meetSpotId: parsed.meetSpotId ? String(parsed.meetSpotId) : null,
        endSpotId: parsed.endSpotId ? String(parsed.endSpotId) : null,
        routeSpotIds: Array.isArray(parsed.routeSpotIds)
          ? parsed.routeSpotIds.map(String)
          : Array.isArray(parsed.spotIds)
            ? parsed.spotIds.map(String)
            : [],
        longestLegMinutes: Number(parsed.longestLegMinutes) || 0,
        totalMinutes: Number(parsed.totalMinutes) || 0,
      };
    }
  } catch {
    // Fall through to the previous pipe encoding.
  }
  const parts = raw.split("|");
  if (parts.length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
    return {
      dateTokyo: parts[0],
      travelMode: parts[1],
      meetSpotId: parts[2] || null,
      endSpotId: parts[3] || null,
      routeSpotIds: parts[4] ? parts[4].split(",").filter(Boolean) : [],
      longestLegMinutes: Number(parts[5]) || 0,
      totalMinutes: Number(parts[6]) || 0,
    };
  }
  return null;
}

export function walkAckFingerprint(input: {
  dateTokyo: string;
  travelMode: string;
  meetSpotId: string | null;
  endSpotId: string | null;
  spotIds: string[];
  longestLegMinutes: number;
  totalMinutes: number;
}): string {
  return encodeWalkAckScope({
    dateTokyo: input.dateTokyo,
    travelMode: input.travelMode,
    meetSpotId: input.meetSpotId,
    endSpotId: input.endSpotId,
    routeSpotIds: input.spotIds,
    longestLegMinutes: input.longestLegMinutes,
    totalMinutes: input.totalMinutes,
  });
}

export function walkAckFingerprintFromPlan(
  session: Pick<Session, "input">,
  plan: Pick<Plan, "items">,
  limits: WalkLimitResult,
): string {
  return walkAckFingerprint({
    dateTokyo: session.input.dateTokyo,
    travelMode: session.input.travelMode,
    meetSpotId: session.input.meet.spotId,
    endSpotId: session.input.end.spotId,
    spotIds: plan.items.map((item) => item.spotId),
    longestLegMinutes: limits.longestLegMinutes,
    totalMinutes: limits.totalMinutes,
  });
}

export function walkAckScopeFromAck(ack: WalkLongAck | null | undefined): WalkAckScope | null {
  if (!ack) return null;
  if (ack.dateTokyo) {
    return {
      dateTokyo: ack.dateTokyo,
      travelMode: ack.travelMode ?? "",
      meetSpotId: ack.meetSpotId ?? null,
      endSpotId: ack.endSpotId ?? null,
      routeSpotIds: ack.routeSpotIds ?? [],
      longestLegMinutes: ack.longestLegMinutes ?? 0,
      totalMinutes: ack.totalMinutes ?? 0,
    };
  }
  return parseWalkAckScope(ack.fingerprint);
}

export function walkLongAckCovers(
  ack: WalkLongAck | null | undefined,
  current: WalkAckScope,
): boolean {
  const acked = walkAckScopeFromAck(ack);
  if (!acked) return false;
  if (acked.dateTokyo !== current.dateTokyo) return false;
  if (acked.travelMode !== current.travelMode) return false;
  if ((acked.meetSpotId ?? "") !== (current.meetSpotId ?? "")) return false;
  if ((acked.endSpotId ?? "") !== (current.endSpotId ?? "")) return false;
  return (
    current.longestLegMinutes <= acked.longestLegMinutes + WALK_ACK_SLACK_MINUTES &&
    current.totalMinutes <= acked.totalMinutes + WALK_ACK_SLACK_MINUTES
  );
}

export function walkLongAckMatches(
  ack: WalkLongAck | null | undefined,
  fingerprint: string,
): boolean {
  const current = parseWalkAckScope(fingerprint);
  if (!current) return false;
  return walkLongAckCovers(ack, current);
}

/** @deprecated Prefer walkLongAckMatches. Global flags and memories are not session consent. */
export function walkLongAcknowledged(input: {
  walkLongAcknowledged?: boolean;
  fingerprint?: string;
  ack?: WalkLongAck | null;
}): boolean {
  if (input.fingerprint) return walkLongAckMatches(input.ack, input.fingerprint);
  return false;
}

export function longWalkQuestion(result: WalkLimitResult): {
  id: "q_long_walk";
  prompt: string;
  options: string[];
} {
  const parts = [
    result.overLeg ? `最長区間 ${result.longestLegMinutes}分（上限 ${WALK_LIMITS.legMinutes}分）` : null,
    result.overTotal ? `合計 ${result.totalMinutes}分（上限 ${WALK_LIMITS.totalMinutes}分）` : null,
  ].filter(Boolean);
  return {
    id: "q_long_walk",
    prompt: `徒歩が長いです（${parts.join("、")}）。徒歩指定は変えていません。公共交通を使う、解散場所を変える、このまま徒歩で続ける、から選んでください。`,
    options: ["公共交通を使う", "解散場所を変える", "このまま徒歩で続ける", "中断する"],
  };
}
