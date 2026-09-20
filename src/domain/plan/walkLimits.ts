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

export function walkAckFingerprint(input: {
  dateTokyo: string;
  travelMode: string;
  meetSpotId: string | null;
  endSpotId: string | null;
  spotIds: string[];
  longestLegMinutes: number;
  totalMinutes: number;
}): string {
  return [
    input.dateTokyo,
    input.travelMode,
    input.meetSpotId ?? "",
    input.endSpotId ?? "",
  ].join("|");
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

export function walkLongAckMatches(
  ack: WalkLongAck | null | undefined,
  fingerprint: string,
): boolean {
  return Boolean(ack?.fingerprint && ack.fingerprint === fingerprint);
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
