import { LIMITS } from "@/config/settings";
import type { Spot } from "@/domain/schemas";
import { getSpotDetails, type PlaceHoursRule, type ProviderCtx } from "@/server/providers";
import { getCatalogSpot } from "@/server/providers/catalog";
import { dailyFresh, remember } from "./memory";
import type { AgentLog, AgentMemories } from "./types";

type PlaceDaily = {
  fetchedAt: string;
  spot?: Spot;
  hours?: PlaceHoursRule[];
  cost?: { min: number; max: number } | null;
  name?: string;
};

export async function runPlace(input: {
  ctx: ProviderCtx;
  log: AgentLog;
  memories: AgentMemories;
  spotIds: string[];
  spots: Record<string, Spot>;
}): Promise<{ spots: Record<string, Spot>; hours: Record<string, PlaceHoursRule[]> }> {
  await input.log("place", "TOOL_STARTED", "営業と料金を調べる");
  const hours: Record<string, PlaceHoursRule[]> = { ...(input.ctx.placeHours ?? {}) };
  const spots = { ...input.spots };
  const ids = input.spotIds.filter(Boolean).slice(0, LIMITS.maxDetailCandidates);
  let fetched = 0;
  let reused = 0;

  for (const id of ids) {
    const remembered = input.memories.place?.facts[`spot:${id}`] as PlaceDaily | undefined;
    if (remembered?.spot && dailyFresh(remembered.fetchedAt)) {
      spots[id] = remembered.spot;
      hours[id] = remembered.hours ?? [];
      reused += 1;
      continue;
    }

    const details = await getSpotDetails(input.ctx, { spotId: id });
    fetched += 1;
    if (details.spot) spots[id] = details.spot;
    const catalog = getCatalogSpot(id);
    const resolvedHours = details.hours.length
      ? details.hours
      : remembered?.hours?.length
        ? remembered.hours
        : (catalog?.hours ?? []);
    hours[id] = resolvedHours;
    if (details.spot && details.spot.costForTwoJpy.value == null && remembered?.cost) {
      details.spot.costForTwoJpy = {
        value: remembered.cost,
        evidenceIds: details.spot.costForTwoJpy.evidenceIds,
      };
      spots[id] = details.spot;
    }
    remember(input.memories, "place", {
      note: `${details.spot?.name ?? id} 営業${resolvedHours.length ? "取得" : "不明"} 料金${
        spots[id]?.costForTwoJpy.value ? "取得" : "不明"
      }`,
      factKey: `spot:${id}`,
      factValue: {
        fetchedAt: new Date().toISOString(),
        name: details.spot?.name ?? remembered?.name,
        spot: details.spot ?? remembered?.spot,
        hours: resolvedHours,
        cost: spots[id]?.costForTwoJpy.value ?? remembered?.cost ?? null,
      } satisfies PlaceDaily,
    });
  }

  input.ctx.placeHours = hours;
  if (reused && !fetched) await input.log("place", "CACHE_HIT", "本日取得済みの詳細を使う");
  await input.log("place", "TOOL_COMPLETED", `${ids.length}件の詳細（取得${fetched} / キャッシュ${reused}）`);
  return { spots, hours };
}
