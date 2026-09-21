import type { Spot } from "@/domain/schemas";
import { listEvents, getVenue, type CatalogEventRecord } from "./repo";
import { catalogEventToSpot, eventIsPlanEligible, venueHours } from "./toSpot";
import { whyNotPlanApply } from "./planAttach";
import type { PlaceHoursRule } from "@/server/providers/placeFacts";

export type CatalogAutoSuggest = {
  spots: Spot[];
  hours: Record<string, PlaceHoursRule[]>;
  /** 自動候補。固定予定にはしない。 */
  autoEventIds: string[];
  reasons: { eventId: string; reason: string }[];
};

/**
 * 日付・エリアに合うカタログイベントを通常候補へ加える。
 * 明示 selectedEventIds と区別し、自動候補は locked にしない。
 */
export async function suggestCatalogEventsForPlan(input: {
  enabled: boolean;
  dateTokyo: string;
  areaHint?: string | null;
  wishText?: string;
  excludeIds?: string[];
  limit?: number;
}): Promise<CatalogAutoSuggest> {
  if (!input.enabled) {
    return { spots: [], hours: {}, autoEventIds: [], reasons: [] };
  }
  const exclude = new Set(input.excludeIds ?? []);
  const events = await listEvents({
    dateTokyo: input.dateTokyo,
    areaName: input.areaHint ?? undefined,
  });
  const wish = (input.wishText ?? "").toLowerCase();
  const ranked = events
    .filter((e) => !exclude.has(e.id))
    .filter((e) => eventIsPlanEligible(e))
    .map((e) => ({ event: e, score: scoreEvent(e, wish) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 4);

  const spots: Spot[] = [];
  const hours: Record<string, PlaceHoursRule[]> = {};
  const autoEventIds: string[] = [];
  const reasons: { eventId: string; reason: string }[] = [];

  for (const { event, score } of ranked) {
    const blocked = whyNotPlanApply(event, input.dateTokyo);
    if (blocked) {
      reasons.push({ eventId: event.id, reason: blocked });
      continue;
    }
    const spot = catalogEventToSpot(event, input.dateTokyo);
    if (!spot) {
      reasons.push({ eventId: event.id, reason: "会場座標がなく移動を検証できない" });
      continue;
    }
    spots.push(spot);
    autoEventIds.push(event.id);
    reasons.push({ eventId: event.id, reason: `auto score=${score}` });
    if (event.venueId) {
      const venue = await getVenue(event.venueId);
      hours[spot.id] = venueHours(venue);
    }
  }
  return { spots, hours, autoEventIds, reasons };
}

function scoreEvent(event: CatalogEventRecord, wish: string): number {
  let score = event.planEligible ? 2 : 0;
  if (wish && event.title.toLowerCase().includes(wish.slice(0, 12))) score += 3;
  if (wish && /展示|美術館|museum|展覧/.test(wish) && /展|美術|museum/i.test(event.genre + event.title)) {
    score += 2;
  }
  return score;
}
