import { WALK_LIMITS } from "@/config/settings";
import type { Plan, Session, TravelLeg, TravelMode, WalkLongAck } from "@/domain/schemas";

export type WalkLimitResult = {
  applies: boolean;
  longestLegMinutes: number;
  totalMinutes: number;
  overLeg: boolean;
  overTotal: boolean;
  exceeds: boolean;
  overLegIds: string[];
  endOver: boolean;
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

function legLabel(
  leg: Pick<TravelLeg, "from" | "to" | "fromSpotId" | "toSpotId">,
  spots: Record<string, { name?: string }>,
): string {
  const nameOf = (spotId: string | null | undefined, fallback: string) =>
    (spotId && spots[spotId]?.name) || fallback;
  if (leg.from === "MEET") return `集合→${nameOf(leg.toSpotId, "最初のスポット")}`;
  if (leg.to === "END") return `${nameOf(leg.fromSpotId, "最後のスポット")}→解散`;
  return `${nameOf(leg.fromSpotId, "区間")}→${nameOf(leg.toSpotId, "次")}`;
}

export function evaluateWalkLimits(
  mode: TravelMode,
  legs: Array<
    Pick<TravelLeg, "mode" | "durationMinutes"> &
      Partial<Pick<TravelLeg, "id" | "from" | "to" | "fromSpotId" | "toSpotId">>
  >,
  limits: { legMinutes: number; totalMinutes: number } = WALK_LIMITS,
): WalkLimitResult {
  const walkLegs = mode === "WALK" ? legs.filter((leg) => leg.mode === "WALK") : [];
  const known = walkLegs
    .map((leg) => ({ leg, minutes: leg.durationMinutes.value }))
    .filter((row): row is { leg: (typeof walkLegs)[number]; minutes: number } => row.minutes != null);
  const longestLegMinutes = known.length ? Math.max(...known.map((row) => row.minutes)) : 0;
  const totalMinutes = known.reduce((sum, row) => sum + row.minutes, 0);
  const overLegIds = known
    .filter((row) => row.minutes > limits.legMinutes)
    .map((row) => row.leg.id)
    .filter((id): id is string => Boolean(id));
  const endLeg = walkLegs.find((leg) => leg.to === "END");
  const endMinutes = endLeg?.durationMinutes.value ?? null;
  const endOver = endMinutes != null && endMinutes > limits.legMinutes;
  const overLeg = longestLegMinutes > limits.legMinutes;
  const overTotal = totalMinutes > limits.totalMinutes;
  return {
    applies: mode === "WALK",
    longestLegMinutes,
    totalMinutes,
    overLeg,
    overTotal,
    overLegIds,
    endOver,
    exceeds: mode === "WALK" && known.length > 0 && (overLeg || overTotal),
  };
}

/** 徒歩上限超過の区間説明。「候補なし」とは別メッセージにする素材。 */
export function describeWalkOverages(
  result: WalkLimitResult,
  legs: Pick<TravelLeg, "id" | "mode" | "durationMinutes" | "from" | "to" | "fromSpotId" | "toSpotId">[],
  spots: Record<string, { name?: string }> = {},
  limits: { legMinutes: number; totalMinutes: number } = WALK_LIMITS,
): string[] {
  const details: string[] = [];
  for (const leg of legs) {
    if (leg.mode !== "WALK") continue;
    const minutes = leg.durationMinutes.value;
    if (minutes == null || minutes <= limits.legMinutes) continue;
    details.push(`「${legLabel(leg, spots)}」が徒歩 ${minutes}分（上限 ${limits.legMinutes}分）`);
  }
  if (result.overTotal) {
    details.push(`行程全体の徒歩合計 ${result.totalMinutes}分（上限 ${limits.totalMinutes}分）`);
  }
  return details;
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

export function longWalkQuestion(
  result: WalkLimitResult,
  details: string[] = [],
): {
  id: "q_long_walk";
  prompt: string;
  options: string[];
} {
  const focus =
    result.endOver && !result.overTotal && result.overLegIds.length <= 1
      ? "解散までの徒歩が上限を超えています"
      : result.overTotal && !result.overLeg
        ? "行程全体の徒歩合計が上限を超えています"
        : "行程の徒歩が上限を超えています";
  const detailText = details.length ? details.join("、") : [
    result.overLeg ? `最長区間 ${result.longestLegMinutes}分（上限 ${WALK_LIMITS.legMinutes}分）` : null,
    result.overTotal ? `合計 ${result.totalMinutes}分（上限 ${WALK_LIMITS.totalMinutes}分）` : null,
  ].filter(Boolean).join("、");
  return {
    id: "q_long_walk",
    prompt: `${focus}（${detailText}）。「徒歩で行ける場所がない」のではなく、いまの候補でも徒歩が長すぎます。徒歩指定は変えていません。公共交通を使う、解散場所を変える、このまま徒歩で続ける、から選んでください。`,
    options: ["公共交通を使う", "解散場所を変える", "このまま徒歩で続ける", "中断する"],
  };
}

export function travelUnverifiedQuestion(unknownCount: number): {
  id: "q_travel_unverified";
  prompt: string;
  options: string[];
} {
  return {
    id: "q_travel_unverified",
    prompt: `店舗候補はありますが、必須の移動 ${unknownCount} 区間を確認できていません。直線距離では代用していません。移動を確認できていない暫定案として表示しています。通常の確定はできません。経路を再取得する、近場の候補で組み直す、集合・解散を変える、から選んでください。`,
    options: ["経路を再取得する", "近場の候補で組み直す", "集合・解散を変える", "中断する"],
  };
}

export function hasUnverifiedTravel(
  issues: { code: string }[],
): boolean {
  return issues.some((i) => i.code === "TRAVEL_UNKNOWN" || i.code === "END_TRAVEL_UNKNOWN");
}
