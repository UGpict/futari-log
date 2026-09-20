import type { Spot } from "@/domain/schemas";
import { searchSpots, type ProviderCtx } from "@/server/providers";
import { dailyFresh, remember } from "./memory";
import { DEFAULT_SCOUT_JOBS, type ScoutBucket, type ScoutJob } from "./scoutJobs";
import type { AgentLog, AgentMemories } from "./types";

type ScoutDaily = {
  fetchedAt: string;
  areaKey: string;
  walk: Spot[];
  exhibit: Spot[];
  sweets: Spot[];
  other: Spot[];
};

export function scoutAreaKey(area: { lat: number; lng: number; name: string }, radiusMeters: number): string {
  return `${area.name}:${area.lat.toFixed(4)}:${area.lng.toFixed(4)}:${radiusMeters}`;
}

function isStayable(spot: Spot): boolean {
  const blob = `${spot.name} ${spot.categories.join(" ")}`;
  if (/喫煙|駐車場|駐輪|トイレ|喫煙所|駅前広場|Station Square/.test(blob)) return false;
  const blocked = new Set([
    "parking",
    "restroom",
    "bus_station",
    "subway_station",
    "train_station",
    "transit_station",
    "taxi_stand",
  ]);
  return !spot.categories.some((t) => blocked.has(t));
}

function mergeUnique(into: Spot[], add: Spot[]) {
  const seen = new Set(into.map((s) => s.id));
  for (const spot of add) {
    if (seen.has(spot.id) || !isStayable(spot)) continue;
    seen.add(spot.id);
    into.push(spot);
  }
}

function asSpots(value: unknown): Spot[] {
  return Array.isArray(value) ? (value as Spot[]) : [];
}

export async function runScout(input: {
  ctx: ProviderCtx;
  log: AgentLog;
  memories: AgentMemories;
  area: { lat: number; lng: number; name: string };
  radiusMeters: number;
  jobs?: ScoutJob[];
  jobKey?: string;
  persist?: boolean;
}): Promise<{ walk: Spot[]; exhibit: Spot[]; sweets: Spot[]; other: Spot[] }> {
  const jobs = input.jobs?.length ? input.jobs : DEFAULT_SCOUT_JOBS;
  const persist = input.persist !== false;
  const areaKey = `${scoutAreaKey(input.area, input.radiusMeters)}:${input.jobKey ?? "default"}`;
  const cached = persist ? (input.memories.scout?.facts.daily as ScoutDaily | undefined) : undefined;
  if (
    cached &&
    cached.areaKey === areaKey &&
    dailyFresh(cached.fetchedAt) &&
    asSpots(cached.walk).length + asSpots(cached.exhibit).length + asSpots(cached.sweets).length + asSpots(cached.other).length > 0
  ) {
    await input.log("scout", "CACHE_HIT", "本日取得済みの候補を使う");
    await input.log(
      "scout",
      "TOOL_COMPLETED",
      `キャッシュ 散歩${cached.walk.length} / 展示${cached.exhibit.length} / 甘味${cached.sweets.length} / 寄り道${cached.other.length}`,
    );
    return {
      walk: asSpots(cached.walk),
      exhibit: asSpots(cached.exhibit),
      sweets: asSpots(cached.sweets),
      other: asSpots(cached.other),
    };
  }

  await input.log("scout", "TOOL_STARTED", "周辺の実在候補を広く探す");
  const buckets: Record<ScoutBucket, Spot[]> = { walk: [], exhibit: [], sweets: [], other: [] };
  const half = Math.ceil(jobs.length / 2);
  for (const slice of [jobs.slice(0, half), jobs.slice(half)]) {
    const results = await Promise.all(
      slice.map((job) =>
        searchSpots(input.ctx, {
          area: input.area,
          category: job.category,
          radiusMeters: input.radiusMeters,
          includedTypes: job.includedTypes,
          rankPreference: job.rankPreference,
        })
          .catch(async () => {
            if (job.rankPreference !== "DISTANCE") return { spots: [] as Spot[], evidence: [] };
            return searchSpots(input.ctx, {
              area: input.area,
              category: job.category,
              radiusMeters: input.radiusMeters,
              includedTypes: job.includedTypes,
            }).catch(() => ({ spots: [] as Spot[], evidence: [] }));
          })
          .then((res) => ({ job, res })),
      ),
    );
    for (const { job, res } of results) {
      mergeUnique(buckets[job.bucket], res.spots);
    }
  }
  if (persist) {
    remember(input.memories, "scout", {
      note: `${input.area.name} 散歩${buckets.walk.length}/展示${buckets.exhibit.length}/甘味${buckets.sweets.length}/寄り道${buckets.other.length}`,
      factKey: "daily",
      factValue: {
        fetchedAt: new Date().toISOString(),
        areaKey,
        walk: buckets.walk,
        exhibit: buckets.exhibit,
        sweets: buckets.sweets,
        other: buckets.other,
      } satisfies ScoutDaily,
    });
  }
  await input.log(
    "scout",
    "TOOL_COMPLETED",
    `散歩${buckets.walk.length} / 展示${buckets.exhibit.length} / 甘味${buckets.sweets.length} / 寄り道${buckets.other.length}`,
  );
  return buckets;
}
