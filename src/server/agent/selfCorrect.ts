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
import { getCatalogSpot } from "@/server/providers/catalog";

/**
 * CLOSED を除いたあと、補充候補は Place Details で当日滞在帯に OPEN と確認できたものだけ。
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
}): Promise<{ ids: string[]; lookups: number }> {
  const ids = input.orderedSpotIds.filter(
    (id) =>
      input.protectedSpotIds.has(id) ||
      (!input.closedSpotIds.has(id) && !(input.liveOnly && id.startsWith("mock:"))),
  );
  let lookups = 0;
  const startAt = tokyoDateTime(input.dateTokyo, input.startTime);
  const sessionEnd = tokyoDateTime(input.dateTokyo, input.endTime);
  const probeEnd = addMinutes(startAt, 50);
  const endAt = new Date(probeEnd).getTime() > new Date(sessionEnd).getTime() ? sessionEnd : probeEnd;

  for (const spot of input.pool) {
    if (ids.length >= input.targetCount) break;
    if (lookups >= input.maxLookups) break;
    if (ids.includes(spot.id) || input.closedSpotIds.has(spot.id) || input.protectedSpotIds.has(spot.id)) {
      continue;
    }
    if (input.liveOnly && spot.id.startsWith("mock:")) continue;
    if (input.rain && spot.environment.value === "OUTDOOR") continue;

    lookups += 1;
    const hours = await resolveHoursForRefill(input.ctx, spot.id);
    input.ctx.placeHours = { ...(input.ctx.placeHours ?? {}), [spot.id]: hours };
    const state = assessSpotOpening(hours, startAt, endAt, toTokyoParts);
    if (state === "OPEN") ids.push(spot.id);
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
      (!input.closedSpotIds.has(id) && !(input.liveOnly && id.startsWith("mock:"))),
  );
  for (const spot of input.pool) {
    if (ids.length >= input.targetCount) break;
    if (ids.includes(spot.id) || input.closedSpotIds.has(spot.id) || input.protectedSpotIds.has(spot.id)) {
      continue;
    }
    if (input.liveOnly && spot.id.startsWith("mock:")) continue;
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
