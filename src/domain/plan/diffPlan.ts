import type { Plan, PlanDiff } from "@/domain/schemas";
import { minutesBetween } from "@/lib/time";

export function diffPlan(from: Plan, to: Plan): PlanDiff {
  const fromBySpot = new Map(from.items.map((i) => [i.spotId, i]));
  const toBySpot = new Map(to.items.map((i) => [i.spotId, i]));
  const keptItemIds: string[] = [];
  const replaced: PlanDiff["replaced"] = [];
  const addedItemIds: string[] = [];
  const removedItemIds: string[] = [];
  const timeShifts: PlanDiff["timeShifts"] = [];

  for (const item of to.items) {
    const prev = fromBySpot.get(item.spotId);
    if (prev) {
      keptItemIds.push(item.id);
      const startDeltaMin = minutesBetween(prev.startAt, item.startAt);
      const endDeltaMin = minutesBetween(prev.endAt, item.endAt);
      if (startDeltaMin !== 0 || endDeltaMin !== 0) {
        timeShifts.push({ itemId: item.id, startDeltaMin, endDeltaMin });
      }
    } else {
      addedItemIds.push(item.id);
    }
  }
  for (const item of from.items) {
    if (!toBySpot.has(item.spotId)) {
      removedItemIds.push(item.id);
    }
  }

  const unpairedRemoved = [...removedItemIds];
  const unpairedAdded = [...addedItemIds];
  while (unpairedRemoved.length && unpairedAdded.length) {
    const fromItemId = unpairedRemoved.shift()!;
    const toItemId = unpairedAdded.shift()!;
    const fromItem = from.items.find((i) => i.id === fromItemId)!;
    const toItem = to.items.find((i) => i.id === toItemId)!;
    replaced.push({
      fromItemId,
      toItemId,
      fromSpotId: fromItem.spotId,
      toSpotId: toItem.spotId,
    });
  }

  const summaryParts: string[] = [];
  if (replaced.length) {
    summaryParts.push(`${replaced.length}件を差し替え`);
  }
  if (timeShifts.length) {
    summaryParts.push("時刻を調整");
  }
  if (!summaryParts.length) {
    summaryParts.push("実質変更なし");
  }

  return {
    fromVersion: from.version,
    toVersion: to.version,
    keptItemIds,
    replaced,
    addedItemIds: unpairedAdded,
    removedItemIds: unpairedRemoved,
    timeShifts,
    summary: summaryParts.join("、"),
  };
}
