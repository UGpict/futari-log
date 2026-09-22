import type { Plan, PlanDiff } from "@/domain/schemas";
import { ANSWER, choice, type WaitingOption } from "@/contracts/waitingChoice";
import { isProtectedPlanItem } from "./replanOrder";

export type ReplanIntent = "replace_place" | "adjust_same_place";

const REPLACE_PLACE =
  /別の|他の|違う場所|違う店|場所がいい|スポットがいい|店がいい|カフェにして|美術館にして|替えて|代えて/;
const SAME_PLACE = /ゆっくり|休憩|時間|遅め|早め|予算|抑え|移動を少|近く|長く居|短く/;

export function classifyReplanIntent(
  instruction: string | null | undefined,
  targetPlanItemId?: string | null,
): ReplanIntent {
  const text = instruction ?? "";
  if (REPLACE_PLACE.test(text)) return "replace_place";
  if (SAME_PLACE.test(text)) return "adjust_same_place";
  if (targetPlanItemId) return "replace_place";
  return "adjust_same_place";
}

export function hasMaterialPlanChange(diff: PlanDiff): boolean {
  if (diff.replaced.some((row) => row.fromSpotId !== row.toSpotId)) return true;
  if (diff.addedItemIds.length > 0 || diff.removedItemIds.length > 0) return true;
  return diff.timeShifts.length > 0;
}

export function replanRequestSatisfied(input: {
  intent: ReplanIntent;
  previous: Plan;
  next: Plan;
  diff: PlanDiff;
  targetPlanItemId?: string | null;
}): boolean {
  if (!hasMaterialPlanChange(input.diff)) return false;
  if (input.intent === "adjust_same_place") {
    return input.diff.timeShifts.length > 0 && input.diff.replaced.every((row) => row.fromSpotId === row.toSpotId);
  }
  if (input.targetPlanItemId) {
    const previous = input.previous.items.find((item) => item.id === input.targetPlanItemId);
    if (!previous) return false;
    if (isProtectedPlanItem(previous)) return false;
    return input.diff.replaced.some(
      (row) => row.fromItemId === previous.id && row.fromSpotId !== row.toSpotId,
    );
  }
  return input.diff.replaced.some((row) => row.fromSpotId !== row.toSpotId);
}

export function replanNoChangeQuestion(prompt?: string): {
  id: "q_replan_no_change";
  prompt: string;
  options: WaitingOption[];
} {
  return {
    id: "q_replan_no_change",
    prompt: prompt ?? "条件に合う別の候補が見つかりませんでした。条件を変えて探しますか？",
    options: [choice(ANSWER.change_conditions, "条件を変える"), choice(ANSWER.abort, "中断する")],
  };
}
