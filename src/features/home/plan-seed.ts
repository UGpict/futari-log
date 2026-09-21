import { HOME_SUGGESTION, type PlanFormSeed } from "./home-suggestion";
import { nearbySampleEvents } from "./sample-events";
import { AI_HACK_VENUE } from "@/config/demo-ai-hack";

/**
 * URL の `seed=` を PlanForm 初期値へ。未知のキーは無視（undefined）。
 * - home-suggestion: 清澄白河駅 + 15:00–21:00
 * - sample:ai-hack: 燈オフィス + 10:00–16:00 固定 + 21:00 まで飲み屋
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
  if (seedKey === "sample:ai-hack") {
    return {
      wish: AI_HACK_VENUE.wish,
      meet: AI_HACK_VENUE.place,
      startTime: AI_HACK_VENUE.dayStart,
      endTime: AI_HACK_VENUE.dayEnd,
      fixed: {
        label: AI_HACK_VENUE.label,
        startTime: AI_HACK_VENUE.fixedStart,
        endTime: AI_HACK_VENUE.fixedEnd,
        spotId: AI_HACK_VENUE.spotId,
      },
    };
  }
  const sample = nearbySampleEvents.find((event) => event.id === seedKey);
  if (!sample) return undefined;
  return {
    wish: sample.planWish,
    meet: sample.meet,
  };
}
