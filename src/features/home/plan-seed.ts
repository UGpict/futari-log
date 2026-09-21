import { HOME_SUGGESTION, type PlanFormSeed } from "./home-suggestion";
import { nearbySampleEvents } from "./sample-events";

/**
 * URL の `seed=` を PlanForm 初期値へ。未知のキーは無視（undefined）。
 * - home-suggestion: 清澄白河駅 + 15:00–21:00
 * - sample:*: sample-events の集合場所と希望文（日付は渡さない）
 */
export function resolvePlanFormSeed(seedKey: string | null | undefined): PlanFormSeed | undefined {
  if (!seedKey) return undefined;
  if (seedKey === "home-suggestion") {
    return {
      wish: HOME_SUGGESTION.wish,
      meet: HOME_SUGGESTION.meetPlace,
      startTime: HOME_SUGGESTION.startTime,
      endTime: HOME_SUGGESTION.endTime,
    };
  }
  const sample = nearbySampleEvents.find((event) => event.id === seedKey);
  if (!sample) return undefined;
  return {
    wish: sample.planWish,
    meet: sample.meet,
  };
}
