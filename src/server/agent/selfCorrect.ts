import { LIMITS } from "@/config/settings";
import type { Spot } from "@/domain/schemas";
import { addMinutes, tokyoDateTime, toTokyoParts } from "@/lib/time";
import {
  assessSpotOpening,
  asSpotOpeningHours,
  getSpotDetails,
  type ProviderCtx,
  type SpotOpeningHours,
} from "@/server/providers";
import { isAiHackCompanionSpotId } from "@/config/demo-ai-hack";
import { getCatalogSpot } from "@/server/providers/catalog";

export type VisitWindow = { startAt: string; endAt: string };

const DEFAULT_STAY_MIN = 50;
const DEFAULT_TRAVEL_MIN = 15;

/**
 * Estimate the visit window for the next slot to fill.
 * Prefers failed plan item times; otherwise walks forward from session start
 * using kept items' known times when available.
 */
export function estimateVisitWindow(input: {
  dateTokyo: string;
  startTime: string;
  endTime: string;
  keptSpotIds: string[];
  /** Prior plan items (with times) from the failed build, when available. */
  previousItems?: { spotId: string; startAt: string; endAt: string }[];
  /** Closed slots we are trying to replace — use their windows first. */
  closedItemWindows?: VisitWindow[];
}): VisitWindow {
  const sessionStart = tokyoDateTime(input.dateTokyo, input.startTime);
  const sessionEnd = tokyoDateTime(input.dateTokyo, input.endTime);

  if (input.closedItemWindows?.length) {
    return input.closedItemWindows[0]!;
  }

  const byId = new Map((input.previousItems ?? []).map((it) => [it.spotId, it]));
  let cursor = sessionStart;
  for (const id of input.keptSpotIds) {
    const known = byId.get(id);
    if (known) {
      cursor = addMinutes(known.endAt, DEFAULT_TRAVEL_MIN);
    } else {
      cursor = addMinutes(cursor, DEFAULT_STAY_MIN + DEFAULT_TRAVEL_MIN);
    }
  }
  const startAt = cursor;
  let endAt = addMinutes(startAt, DEFAULT_STAY_MIN);
  if (new Date(endAt).getTime() > new Date(sessionEnd).getTime()) endAt = sessionEnd;
  if (new Date(startAt).getTime() >= new Date(sessionEnd).getTime()) {
    return {
      startAt: addMinutes(sessionEnd, -DEFAULT_STAY_MIN),
      endAt: sessionEnd,
    };
  }
  return { startAt, endAt };
}

/**
 * CLOSED を除いたあと、補充候補は Place Details で「その候補が入る訪問予定帯」に OPEN と確認できたものだけ。
 * 既存の UNKNOWN は残す。決定論: pool の並びどおりに走査。
 */
export async function refillOpenSpotIds(input: {
  orderedSpotIds: string[];
  closedSpotIds: Set<string>;
  protectedSpotIds: Set<string>;
  pool: Spot[];
  rain: boolean;
  liveOnly: boolean;
  targetCount: number;
  maxLookups: number;
  dateTokyo: string;
  startTime: string;
  endTime: string;
  ctx: ProviderCtx;
  previousItems?: { spotId: string; startAt: string; endAt: string }[];
  closedItemWindows?: VisitWindow[];
}): Promise<{ ids: string[]; lookups: number }> {
  const ids = input.orderedSpotIds.filter(
    (id) =>
      input.protectedSpotIds.has(id) ||
      (!input.closedSpotIds.has(id) &&
        !(input.liveOnly && id.startsWith("mock:") && !isAiHackCompanionSpotId(id))),
  );
  let lookups = 0;
  let closedWindows = [...(input.closedItemWindows ?? [])];

  for (const spot of input.pool) {
    if (ids.length >= input.targetCount) break;
    if (lookups >= input.maxLookups) break;
    if (ids.includes(spot.id) || input.closedSpotIds.has(spot.id) || input.protectedSpotIds.has(spot.id)) {
      continue;
    }
    if (input.liveOnly && spot.id.startsWith("mock:") && !isAiHackCompanionSpotId(spot.id)) continue;
    if (input.rain && spot.environment.value === "OUTDOOR") continue;

    const window = estimateVisitWindow({
      dateTokyo: input.dateTokyo,
      startTime: input.startTime,
      endTime: input.endTime,
      keptSpotIds: ids,
      previousItems: input.previousItems,
      closedItemWindows: closedWindows.length ? [closedWindows[0]!] : undefined,
    });

    lookups += 1;
    const hours = await resolveHoursForRefill(input.ctx, spot.id);
    input.ctx.placeHours = { ...(input.ctx.placeHours ?? {}), [spot.id]: hours };
    const state = assessSpotOpening(hours, window.startAt, window.endAt, toTokyoParts);
    // Only OPEN at the estimated visit window. CLOSED/UNKNOWN are not adopted here;
    // when visit time was only a meet-time guess, callers should pass closedItemWindows
    // / previousItems so we do not probe at 集合+50m. Rebuild always re-validates.
    if (state === "OPEN") {
      ids.push(spot.id);
      if (closedWindows.length) closedWindows = closedWindows.slice(1);
    }
  }

  return { ids, lookups };
}

/** 旧挙動: CLOSED 以外を無確認で補充（再現テスト用）。 */
export function refillWithoutOpenCheck(input: {
  orderedSpotIds: string[];
  closedSpotIds: Set<string>;
  protectedSpotIds: Set<string>;
  pool: Spot[];
  rain: boolean;
  liveOnly: boolean;
  targetCount: number;
}): string[] {
  const ids = input.orderedSpotIds.filter(
    (id) =>
      input.protectedSpotIds.has(id) ||
      (!input.closedSpotIds.has(id) &&
        !(input.liveOnly && id.startsWith("mock:") && !isAiHackCompanionSpotId(id))),
  );
  for (const spot of input.pool) {
    if (ids.length >= input.targetCount) break;
    if (ids.includes(spot.id) || input.closedSpotIds.has(spot.id) || input.protectedSpotIds.has(spot.id)) {
      continue;
    }
    if (input.liveOnly && spot.id.startsWith("mock:") && !isAiHackCompanionSpotId(spot.id)) continue;
    if (input.rain && spot.environment.value === "OUTDOOR") continue;
    ids.push(spot.id);
  }
  return ids;
}

async function resolveHoursForRefill(ctx: ProviderCtx, spotId: string): Promise<SpotOpeningHours> {
  if (ctx.placeHours?.[spotId]) return asSpotOpeningHours(ctx.placeHours[spotId]);
  const catalog = getCatalogSpot(spotId);
  if (catalog) return { regular: catalog.hours, dated: catalog.datedHours ?? {} };
  const details = await getSpotDetails(ctx, { spotId });
  return details.hours;
}

export const SELF_CORRECT_REFILL_LOOKUPS = LIMITS.maxSelfCorrectRefillLookups;
