import type { Memory, MemoryPlanDirective, Spot } from "@/domain/schemas";
import { directivesOf } from "@/domain/memory";

export type MemoryInfluence = {
  memoryId: string;
  effect: "PRIORITY" | "DURATION" | "REST_INSERT" | "NONE";
  detail: string;
};

export type DirectiveEffects = {
  preferSeatedRest: Memory[];
  shortenCategories: Map<string, { minutes: number | null; memories: Memory[] }>;
  revisitSpotIds: Map<string, Memory[]>;
  preferNewSpots: Memory[];
  walkHardCap: { minutes: number | null; memoryIds: string[] };
};

export function collectDirectiveEffects(memories: Memory[]): DirectiveEffects {
  const preferSeatedRest: Memory[] = [];
  const shortenCategories = new Map<string, { minutes: number | null; memories: Memory[] }>();
  const revisitSpotIds = new Map<string, Memory[]>();
  const preferNewSpots: Memory[] = [];
  let walkCap: number | null = null;
  const walkIds: string[] = [];

  for (const memory of memories) {
    if (!memory.active) continue;
    for (const d of directivesOf(memory)) {
      applyOne(memory, d, {
        preferSeatedRest,
        shortenCategories,
        revisitSpotIds,
        preferNewSpots,
        setWalk(n) {
          if (memory.strength !== "HARD") return;
          if (n == null || n <= 0) return;
          walkCap = walkCap == null ? n : Math.min(walkCap, n);
          walkIds.push(memory.id);
        },
      });
    }
  }

  return {
    preferSeatedRest,
    shortenCategories,
    revisitSpotIds,
    preferNewSpots,
    walkHardCap: { minutes: walkCap, memoryIds: [...new Set(walkIds)] },
  };
}

function applyOne(
  memory: Memory,
  d: MemoryPlanDirective,
  sink: {
    preferSeatedRest: Memory[];
    shortenCategories: Map<string, { minutes: number | null; memories: Memory[] }>;
    revisitSpotIds: Map<string, Memory[]>;
    preferNewSpots: Memory[];
    setWalk: (n: number | null) => void;
  },
) {
  switch (d.kind) {
    case "PREFER_SEATED_REST":
      sink.preferSeatedRest.push(memory);
      break;
    case "SHORTEN_CATEGORY_STAY": {
      const cats = d.categories?.length ? d.categories : ["exhibit", "walk"];
      for (const cat of cats) {
        const cur = sink.shortenCategories.get(cat) ?? { minutes: null, memories: [] };
        cur.memories.push(memory);
        if (d.maxStayMinutes != null) {
          cur.minutes =
            cur.minutes == null ? d.maxStayMinutes : Math.min(cur.minutes, d.maxStayMinutes);
        }
        sink.shortenCategories.set(cat, cur);
      }
      break;
    }
    case "REVISIT_SPOT":
      if (d.spotId) {
        const list = sink.revisitSpotIds.get(d.spotId) ?? [];
        list.push(memory);
        sink.revisitSpotIds.set(d.spotId, list);
      }
      break;
    case "PREFER_NEW_SPOTS":
      sink.preferNewSpots.push(memory);
      break;
    case "WALK_HARD_CAP":
      sink.setWalk(d.walkHardCapMinutes);
      break;
    default:
      break;
  }
}

export function spotCategoryKey(spot: Spot): string {
  const cats = spot.categories ?? [];
  if (cats.some((c) => /cafe|喫茶|カフェ|rest/i.test(c))) return "cafe";
  if (cats.some((c) => /museum|exhibit|展示|美術館|gallery/i.test(c))) return "exhibit";
  if (cats.some((c) => /park|walk|散歩/i.test(c))) return "walk";
  if (cats.some((c) => /甜|sweets|デザート|菓子/i.test(c))) return "sweets";
  return "other";
}

export function stayMinutesForSpot(
  spot: Spot,
  effects: DirectiveEffects,
  defaultStay = 50,
): { stay: number; influences: MemoryInfluence[] } {
  const influences: MemoryInfluence[] = [];
  let stay = defaultStay;
  const cat = spotCategoryKey(spot);
  const shorten = effects.shortenCategories.get(cat);
  if (shorten) {
    stay = shorten.minutes ?? 35;
    for (const m of shorten.memories) {
      influences.push({
        memoryId: m.id,
        effect: "DURATION",
        detail: `${spot.name} の滞在を短めにした（承認済み方針）`,
      });
    }
  }
  if (
    effects.preferSeatedRest.length &&
    (spot.standingBurden.value === "HIGH" || spot.standingBurden.value === "MEDIUM")
  ) {
    stay = Math.min(stay, 35);
    for (const m of effects.preferSeatedRest) {
      influences.push({
        memoryId: m.id,
        effect: "DURATION",
        detail: `${spot.name} の立ち負担を考慮し滞在を短くした`,
      });
    }
  }
  if (effects.preferSeatedRest.length && spot.restEase.value === "EASY") {
    stay = Math.max(stay, 40);
    for (const m of effects.preferSeatedRest) {
      influences.push({
        memoryId: m.id,
        effect: "REST_INSERT",
        detail: `前回承認した休憩方針により、${spot.name} を休憩として配置`,
      });
    }
  }
  return { stay, influences };
}
