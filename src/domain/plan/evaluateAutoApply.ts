import type { Plan, PlanDiff, AutoApplyPolicy } from "@/domain/schemas";
import { doneItemsPreserved } from "./validatePlan";

export type AutoApplyInput = {
  previous: Plan;
  next: Plan;
  diff: PlanDiff;
  policy: AutoApplyPolicy;
  nowIso: string;
  expectedBaseVersion: number;
};

export type AutoApplyResult =
  | { apply: true; notify: true; reasons: string[] }
  | { apply: false; notify: false; reasons: string[] };

export function evaluateAutoApply(input: AutoApplyInput): AutoApplyResult {
  const reasons: string[] = [];
  const { previous, next, diff, policy, nowIso, expectedBaseVersion } = input;

  if (!policy.enabled) {
    reasons.push("自動変更はOFFです");
  }
  if (policy.validUntil && new Date(policy.validUntil) < new Date(nowIso)) {
    reasons.push("事前許可の期限が切れています");
  }
  if (previous.version !== expectedBaseVersion) {
    reasons.push("元の planVersion が一致しません");
  }
  if (next.validation.state !== "PASS") {
    reasons.push(
      next.validation.state === "CONDITIONAL"
        ? "新しい行程は CONDITIONAL で、AUTO_NOTIFY には使えません"
        : "新しい行程が PASS ではありません",
    );
  }
  if (diff.replaced.length + diff.removedItemIds.length + diff.addedItemIds.length > 1) {
    reasons.push("差し替えは未着手・非固定の最大1件までです");
  }
  const changedSpots = [...diff.replaced, ...diff.removedItemIds.map((id) => ({ fromItemId: id }))];
  for (const ch of changedSpots) {
    const item = previous.items.find((i) => i.id === ch.fromItemId);
    if (!item) continue;
    if (item.locked) reasons.push("固定予定は変更できません");
    if (item.progress !== "NOT_STARTED") reasons.push("完了済み・進行中は変更できません");
  }
  if (!doneItemsPreserved(previous.items, next.items)) {
    reasons.push("完了済みまたは進行中の滞在が変わっています");
  }

  const prevStart = previous.items[0]?.startAt;
  const nextStart = next.items[0]?.startAt;
  const prevLast = previous.items[previous.items.length - 1];
  const nextLast = next.items[next.items.length - 1];
  if (prevStart && nextStart && prevStart !== nextStart) {
    const prevMeet = previous.legs.find((l) => l.from === "MEET");
    const nextMeet = next.legs.find((l) => l.from === "MEET");
    if (prevMeet?.fromSpotId !== nextMeet?.fromSpotId) {
      reasons.push("開始地点が変わっています");
    }
  }
  const prevEndLeg = previous.legs.find((l) => l.to === "END");
  const nextEndLeg = next.legs.find((l) => l.to === "END");
  if ((prevEndLeg?.toSpotId ?? null) !== (nextEndLeg?.toSpotId ?? null)) {
    reasons.push("終了地点が変わっています");
  }
  if (prevLast && nextLast && new Date(nextLast.endAt) > new Date(prevLast.endAt)) {
    reasons.push("終了時刻が遅くなっています");
  }

  const prevTravel = sumKnownTravel(previous);
  const nextTravel = sumKnownTravel(next);
  if (prevTravel != null && nextTravel != null && nextTravel > prevTravel) {
    reasons.push("残りの移動時間が増えています");
  }
  if (prevTravel == null || nextTravel == null) {
    reasons.push("移動時間が不明なため自動適用できません");
  }

  const prevCost = previous.costEstimate.totalJpy.value;
  const nextCost = next.costEstimate.totalJpy.value;
  if (nextCost == null || prevCost == null) {
    reasons.push("金額不明のため自動適用できません");
  } else if (nextCost > prevCost) {
    reasons.push("二人分の総額上限が増えています");
  }

  const stale = next.validation.issues.some((i) =>
    ["OPENING_UNKNOWN", "COST_UNKNOWN", "TRAVEL_UNKNOWN", "STALE_CACHE"].includes(i.code),
  );
  if (stale) {
    reasons.push("不明または期限切れの情報は自動適用に使えません");
  }

  if (reasons.length > 0) {
    return { apply: false, notify: false, reasons };
  }
  return { apply: true, notify: true, reasons: ["事前許可の範囲内です"] };
}

function sumKnownTravel(plan: Plan): number | null {
  let sum = 0;
  for (const leg of plan.legs) {
    if (leg.durationMinutes.value == null) return null;
    sum += leg.durationMinutes.value + (leg.delayMinutesInjected ?? 0);
  }
  return sum;
}

export function remainingTravelMinutes(plan: Plan): number | null {
  return sumKnownTravel(plan);
}
