import type { Spot } from "@/domain/schemas";
import { toTokyoParts } from "@/lib/time";
import { isClosedOnDate, parseClosedRule } from "./extract";
import { getEvent, getVenue } from "./repo";
import { catalogEventToSpot, eventIsPlanEligible, venueHours } from "./toSpot";
import type { PlaceHoursRule } from "@/server/providers/placeFacts";

export type EventPlanFailure = { id: string; reason: string };

export type EventPlanAttach = {
  spots: Spot[];
  hours: Record<string, PlaceHoursRule[]>;
  failed: EventPlanFailure[];
  needsConfirmation: boolean;
  fallbackAcknowledged: boolean;
};

export function whyNotPlanApply(event: import("./repo").CatalogEventRecord, dateTokyo: string): string | null {
  if (!eventIsPlanEligible(event)) return "タイトルと開催期間が未検証のため確定プランに使えない";
  if (event.fields.hours.confirmation !== "VERIFIED" || !event.timeStart || !event.timeEnd) {
    return "開催時間が未検証のため確定プランに使えない";
  }
  if (event.fields.closedDays.confirmation !== "VERIFIED" || !event.fields.closedDays.value) {
    return "休館日が未検証のため確定プランに使えない";
  }
  const closedRule = parseClosedRule(event.fields.closedDays.value, Number(dateTokyo.slice(0, 4)));
  if (!closedRule) return "休館日が未検証のため確定プランに使えない";
  const weekday = toTokyoParts(`${dateTokyo}T12:00:00+09:00`).weekday;
  if (isClosedOnDate(closedRule, dateTokyo, weekday)) return "その日は休館です";
  return null;
}

export async function loadSelectedEventSpots(input: {
  enabled: boolean;
  selectedEventIds: string[];
  dateTokyo: string;
  fallbackAcknowledged?: boolean;
}): Promise<EventPlanAttach> {
  if (!input.enabled || input.selectedEventIds.length === 0) {
    return { spots: [], hours: {}, failed: [], needsConfirmation: false, fallbackAcknowledged: false };
  }
  const spots: Spot[] = [];
  const hours: Record<string, PlaceHoursRule[]> = {};
  const failed: EventPlanFailure[] = [];
  for (const id of input.selectedEventIds) {
    const event = await getEvent(id);
    if (!event) {
      failed.push({ id, reason: "カタログに無い" });
      continue;
    }
    const blocked = whyNotPlanApply(event, input.dateTokyo);
    if (blocked) {
      failed.push({ id, reason: blocked });
      continue;
    }
    const spot = catalogEventToSpot(event, input.dateTokyo);
    if (!spot) {
      failed.push({ id, reason: "会場座標がなく移動を検証できない" });
      continue;
    }
    spots.push(spot);
    if (event.venueId) {
      const venue = await getVenue(event.venueId);
      hours[spot.id] = venueHours(venue);
    }
  }
  const acknowledged = Boolean(input.fallbackAcknowledged);
  return {
    spots,
    hours,
    failed,
    needsConfirmation: spots.length === 0 && !acknowledged,
    fallbackAcknowledged: acknowledged,
  };
}
