import type { Spot } from "@/domain/schemas";
import type { CatalogEventRecord, CatalogVenueRecord } from "./repo";
import { parseClosedRule } from "./extract";
import { parsePlaceHours, type PlaceHoursRule } from "@/server/providers/placeFacts";

export function catalogEventToSpot(event: CatalogEventRecord, dateTokyo: string): Spot | null {
  if (event.lat == null || event.lng == null) return null;
  const periodOk =
    event.fields.periodStart.confirmation === "VERIFIED" &&
    event.fields.periodEnd.confirmation === "VERIFIED" &&
    event.dateStart &&
    event.dateEnd;
  const hoursOk = event.fields.hours.confirmation === "VERIFIED" && event.timeStart && event.timeEnd;
  const closedParsed = parseClosedRule(event.fields.closedDays.value, Number(dateTokyo.slice(0, 4)));
  const closedOk = event.fields.closedDays.confirmation === "VERIFIED" && closedParsed;
  return {
    id: event.id,
    name: event.title,
    lat: event.lat,
    lng: event.lng,
    categories: ["museum", "art_gallery", "exhibition"],
    environment: { value: "INDOOR", evidenceIds: [] },
    costForTwoJpy: { value: null, evidenceIds: [] },
    restEase: { value: "LIMITED", evidenceIds: [] },
    standingBurden: { value: "MEDIUM", evidenceIds: [] },
    officialUrl: event.officialUrl ?? event.sourceUrl,
    spotKind: "EVENT",
    catalogEventId: event.id,
    catalogVenueId: event.venueId,
    eventWindow: periodOk
      ? {
          startAt: `${event.dateStart}T00:00:00+09:00`,
          endAt: `${event.dateEnd}T23:59:00+09:00`,
          confirmation: "VERIFIED",
          evidenceIds: [],
        }
      : {
          startAt: null,
          endAt: null,
          confirmation: "UNKNOWN",
          evidenceIds: [],
        },
    eventHours: hoursOk
      ? {
          open: event.timeStart,
          close: event.timeEnd,
          fridayClose: event.fields.fridayClose.confirmation === "VERIFIED" ? event.fields.fridayClose.value : null,
          confirmation: "VERIFIED",
          evidenceIds: [],
        }
      : {
          open: null,
          close: null,
          fridayClose: null,
          confirmation: "UNKNOWN",
          evidenceIds: [],
        },
    eventClosed: closedOk && closedParsed
      ? {
          weekdays: closedParsed.weekdays,
          exceptionOpen: closedParsed.exceptionOpen,
          extraClosed: closedParsed.extraClosed,
          confirmation: "VERIFIED",
          evidenceIds: [],
        }
      : {
          weekdays: [],
          exceptionOpen: [],
          extraClosed: [],
          confirmation: "UNKNOWN",
          evidenceIds: [],
        },
  };
}

export function venueHours(venue: CatalogVenueRecord | null): PlaceHoursRule[] {
  if (!venue?.regularOpeningHours) return [];
  return parsePlaceHours(venue.regularOpeningHours as { periods?: never });
}

export function eventIsPlanEligible(event: CatalogEventRecord): boolean {
  return event.planEligible === true;
}
