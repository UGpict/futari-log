import { LIMITS } from "@/config/settings";
import type { Spot } from "@/domain/schemas";
import {
  asSpotOpeningHours,
  emptySpotOpeningHours,
  getSpotDetails,
  hasOpeningData,
  type PlaceHoursRule,
  type ProviderCtx,
  type SpotOpeningHours,
} from "@/server/providers";
import { getCatalogSpot } from "@/server/providers/catalog";
import { applyStoredPricesToSpot } from "@/server/catalog/applyStoredPrices";
import { enqueuePriceEnrichRun } from "@/server/catalog/enqueuePriceEnrich";
import { dailyFresh, remember } from "./memory";
import type { AgentLog, AgentMemories } from "./types";

type PlaceDaily = {
  fetchedAt: string;
  spot?: Spot;
  hours?: SpotOpeningHours | PlaceHoursRule[];
  /** Two-person cost after enrichment only; never Places band. */
  cost?: { min: number; max: number } | null;
  name?: string;
};

/** Settled itineraries must not silently pick up newly collected prices. */
export function sessionAllowsPriceReapply(status: string | undefined | null): boolean {
  if (!status) return true;
  return !["CONFIRMED", "IN_PROGRESS", "DONE", "REFLECTED"].includes(status);
}

function enqueuePriceEnrich(input: {
  spot: Spot;
  uid?: string;
  sessionId?: string;
  allowEnqueue: boolean;
}): void {
  if (!input.allowEnqueue || !input.uid || !input.sessionId) return;
  if (input.spot.costForTwoJpy.value != null) return;
  if (
    input.spot.costAccounting?.status === "CALCULATED" ||
    input.spot.costAccounting?.status === "ESTIMATED"
  ) {
    return;
  }
  // Never await: plan path stays free of LLM wait (insertPendingRun + kickRun only).
  void enqueuePriceEnrichRun({
    uid: input.uid,
    sessionId: input.sessionId,
    placeId: input.spot.id,
    venueName: input.spot.name,
    websiteUri: input.spot.officialUrl,
  }).catch(() => undefined);
}

export async function runPlace(input: {
  ctx: ProviderCtx;
  log: AgentLog;
  memories: AgentMemories;
  spotIds: string[];
  spots: Record<string, Spot>;
  uid?: string;
  sessionId?: string;
  sessionStatus?: string | null;
}): Promise<{ spots: Record<string, Spot>; hours: Record<string, SpotOpeningHours> }> {
  await input.log("place", "TOOL_STARTED", "営業と料金を調べる");
  const hours: Record<string, SpotOpeningHours> = {};
  for (const [id, raw] of Object.entries(input.ctx.placeHours ?? {})) {
    hours[id] = asSpotOpeningHours(raw);
  }
  const spots = { ...input.spots };
  const ids = input.spotIds.filter(Boolean).slice(0, LIMITS.maxDetailCandidates);
  let fetched = 0;
  let reused = 0;
  const allowReapply = sessionAllowsPriceReapply(input.sessionStatus);

  for (const id of ids) {
    const remembered = input.memories.place?.facts[`spot:${id}`] as PlaceDaily | undefined;
    if (remembered?.spot && dailyFresh(remembered.fetchedAt)) {
      spots[id] = allowReapply
        ? await applyStoredPricesToSpot(remembered.spot)
        : remembered.spot;
      hours[id] = asSpotOpeningHours(remembered.hours);
      enqueuePriceEnrich({
        spot: spots[id],
        uid: input.uid,
        sessionId: input.sessionId,
        allowEnqueue: allowReapply,
      });
      reused += 1;
      continue;
    }

    const details = await getSpotDetails(input.ctx, { spotId: id });
    fetched += 1;
    let spot = details.spot ?? undefined;
    if (spot) {
      if (allowReapply) spot = await applyStoredPricesToSpot(spot);
      spots[id] = spot;
      enqueuePriceEnrich({
        spot,
        uid: input.uid,
        sessionId: input.sessionId,
        allowEnqueue: allowReapply,
      });
    }
    const catalog = getCatalogSpot(id);
    const resolvedHours = hasOpeningData(details.hours)
      ? details.hours
      : remembered?.hours
        ? asSpotOpeningHours(remembered.hours)
        : catalog
          ? { regular: catalog.hours, dated: catalog.datedHours ?? {} }
          : emptySpotOpeningHours();
    hours[id] = resolvedHours;
    remember(input.memories, "place", {
      note: `${spot?.name ?? id} 営業${hasOpeningData(resolvedHours) ? "取得" : "不明"} 料金${
        spots[id]?.costForTwoJpy.value ? "取得" : "不明"
      }`,
      factKey: `spot:${id}`,
      factValue: {
        fetchedAt: new Date().toISOString(),
        name: spot?.name ?? remembered?.name,
        spot: spots[id] ?? remembered?.spot,
        hours: resolvedHours,
        cost: allowReapply ? (spots[id]?.costForTwoJpy.value ?? null) : null,
      } satisfies PlaceDaily,
    });
  }

  input.ctx.placeHours = hours;
  if (reused && !fetched) await input.log("place", "CACHE_HIT", "本日取得済みの詳細を使う");
  await input.log("place", "TOOL_COMPLETED", `${ids.length}件の詳細（取得${fetched} / キャッシュ${reused}）`);
  return { spots, hours };
}
