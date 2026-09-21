import { getEnv } from "@/config/env";
import {
  classifySpotKind,
  planningFacetsFromWish,
  spotMatchesWish,
  wantsSameKindTour,
} from "@/contracts";
import type { Memory, Spot } from "@/domain/schemas";
import type { LlmCallResult } from "@/server/llm";
import { addMinutes, tokyoDateTime, toTokyoParts } from "@/lib/time";
import { getCatalogSpot } from "@/server/providers/catalog";
import { assessHours } from "@/server/providers/placeFacts";
import { isAiHackCompanionSpotId } from "@/config/demo-ai-hack";
import { remember } from "./memory";
import type { AgentLog, AgentMemories } from "./types";

/** Soft cap for itinerary stops (locked appointments count toward this). */
export const PLANNER_MAX_STOPS = 6;

export type PlannerPreference = {
  id: string;
  content: string;
  priority: "MUST" | "PREFER";
};

function closedForSession(spot: Spot, dateTokyo?: string, startTime?: string, endTime?: string): boolean {
  if (!dateTokyo || !startTime || !endTime) return false;
  const hours = getCatalogSpot(spot.id)?.hours;
  if (!hours?.length) return false;
  const startAt = tokyoDateTime(dateTokyo, startTime);
  const sessionEnd = tokyoDateTime(dateTokyo, endTime);
  const probeEnd = addMinutes(startAt, 50);
  const endAt = new Date(probeEnd).getTime() > new Date(sessionEnd).getTime() ? sessionEnd : probeEnd;
  return assessHours(hours, startAt, endAt, toTokyoParts) === "CLOSED";
}

function prefNeedsSpot(pref: PlannerPreference): boolean {
  return planningFacetsFromWish(pref.content).length > 0;
}

function prefFulfilledBy(pref: PlannerPreference, spots: Spot[]): boolean {
  if (!prefNeedsSpot(pref)) return true;
  return spots.some((spot) => spotMatchesWish(spot, pref.content));
}

function resolvePrefs(args: {
  preferences?: PlannerPreference[];
  wishText?: string;
}): PlannerPreference[] {
  if (args.preferences?.length) return args.preferences;
  const text = args.wishText?.trim();
  if (!text) return [];
  return [{ id: "wish", content: text, priority: "PREFER" }];
}

export function pickFromCandidates(args: {
  walk: Spot[];
  exhibit: Spot[];
  sweets: Spot[];
  other: Spot[];
  lockedIds: string[];
  /** Spots for locked ids when they are not already in the scout pools. */
  lockedSpots?: Spot[];
  rain: boolean;
  avoidIds: string[];
  dateTokyo?: string;
  startTime?: string;
  endTime?: string;
  preferCheaper?: boolean;
  preferRest?: boolean;
  allowAvoidedFallback?: boolean;
  /** Structured prefs (preferred). */
  preferences?: PlannerPreference[];
  /** Legacy single blob; treated as one PREFER when preferences omitted. */
  wishText?: string;
  maxStops?: number;
}): {
  selected: string[];
  rejected: { spotId: string; reason: string }[];
  unmetMust: PlannerPreference[];
  overflowMust: PlannerPreference[];
} {
  const rejected: { spotId: string; reason: string }[] = [];
  const selected: string[] = [];
  const unmetMust: PlannerPreference[] = [];
  const overflowMust: PlannerPreference[] = [];
  const allowAvoidedFallback = args.allowAvoidedFallback !== false;
  const maxStops = args.maxStops ?? PLANNER_MAX_STOPS;
  const prefs = resolvePrefs(args);
  const wishText = args.wishText ?? prefs.map((pref) => pref.content).join("。");

  const addId = (id?: string | null) => {
    if (id && !selected.includes(id)) selected.push(id);
  };
  const usable = (list: Spot[], allowAvoid = false) =>
    list.filter((s) => {
      if (args.lockedIds.includes(s.id) || selected.includes(s.id)) return false;
      if (!allowAvoid && args.avoidIds.includes(s.id)) return false;
      if (args.rain && s.environment.value === "OUTDOOR") return false;
      if (closedForSession(s, args.dateTokyo, args.startTime, args.endTime)) {
        rejected.push({ spotId: s.id, reason: "その時間帯は閉店" });
        return false;
      }
      return true;
    });

  for (const s of args.walk.filter((x) => x.environment.value === "OUTDOOR")) {
    if (args.rain && !args.lockedIds.includes(s.id)) {
      rejected.push({ spotId: s.id, reason: "雨のため屋外を見送り" });
    }
  }

  const allPool = [
    ...(args.lockedSpots ?? []),
    ...args.exhibit,
    ...args.walk,
    ...args.sweets,
    ...args.other,
  ];
  const byId = new Map<string, Spot>();
  for (const spot of allPool) byId.set(spot.id, spot);

  const picked = new Map<string, Spot>();
  const rememberSpot = (spot?: Spot) => {
    if (!spot || picked.has(spot.id) || selected.includes(spot.id)) return false;
    if (selected.length >= maxStops) return false;
    picked.set(spot.id, spot);
    addId(spot.id);
    return true;
  };

  for (const id of args.lockedIds) {
    addId(id);
    const spot = byId.get(id);
    if (spot) picked.set(id, spot);
  }

  const coveringSpots = () =>
    selected.map((id) => byId.get(id)).filter((spot): spot is Spot => Boolean(spot));

  const rank = (list: Spot[]) => {
    const copy = [...list];
    if (args.preferCheaper) {
      copy.sort((a, b) => (a.costForTwoJpy.value?.max ?? 9_999_999) - (b.costForTwoJpy.value?.max ?? 9_999_999));
    }
    if (args.preferRest) {
      copy.sort((a, b) => Number(b.restEase.value === "EASY") - Number(a.restEase.value === "EASY"));
    }
    return copy;
  };

  const takeForPref = (pref: PlannerPreference): Spot | undefined => {
    const matched = (allowAvoid: boolean) =>
      rank(usable(allPool.filter((spot) => spotMatchesWish(spot, pref.content)), allowAvoid));
    return matched(false)[0] ?? (allowAvoidedFallback ? matched(true)[0] : undefined);
  };

  const reserveFor = (pref: PlannerPreference, asMust: boolean) => {
    if (prefFulfilledBy(pref, coveringSpots())) return;
    if (selected.length >= maxStops) {
      if (asMust) overflowMust.push(pref);
      return;
    }
    const spot = takeForPref(pref);
    if (!spot) {
      if (asMust) unmetMust.push(pref);
      return;
    }
    rememberSpot(spot);
  };

  for (const pref of prefs.filter((item) => item.priority === "MUST")) {
    reserveFor(pref, true);
  }
  for (const pref of prefs.filter((item) => item.priority === "PREFER")) {
    reserveFor(pref, false);
  }

  const take = (list: Spot[]) =>
    rank(usable(list))[0] ?? (allowAvoidedFallback ? rank(usable(list, true))[0] : undefined);
  const tour = wantsSameKindTour(wishText);
  // Soft diversity fills leftover slots up to ~3; MUST/PREFER reservations stay first and are never displaced.
  const softTarget = Math.min(maxStops, Math.max(selected.length, 3));
  if (selected.length < softTarget) rememberSpot(take(args.exhibit));
  if (selected.length < softTarget) rememberSpot(take(args.walk));
  if (selected.length < softTarget) rememberSpot(take(args.sweets));
  const kinds = new Set(
    [...picked.values()].map((spot) => classifySpotKind(spot.name, spot.categories)),
  );
  const fulfilledMust = prefs.filter(
    (pref) => pref.priority === "MUST" && prefFulfilledBy(pref, coveringSpots()),
  );
  const softAdd = (spot?: Spot) => {
    if (!spot) return false;
    if (fulfilledMust.some((pref) => spotMatchesWish(spot, pref.content))) {
      rejected.push({ spotId: spot.id, reason: "すでに満たしたMUSTと同じ希望なので見送り" });
      return false;
    }
    const kind = classifySpotKind(spot.name, spot.categories);
    if (!tour && kinds.has(kind) && kind !== "other" && selected.length >= 2) {
      rejected.push({ spotId: spot.id, reason: `同じ過ごし方（${kind}）が続きすぎるので見送り` });
      return false;
    }
    if (!rememberSpot(spot)) return false;
    kinds.add(kind);
    return true;
  };
  if (selected.length < softTarget) softAdd(take(args.other));
  if (selected.length < softTarget) {
    for (const spot of rank(usable(allPool, allowAvoidedFallback))) {
      if (selected.length >= softTarget) break;
      softAdd(spot);
    }
  }

  return { selected, rejected, unmetMust, overflowMust };
}

export function pickReplacementCandidate(args: {
  currentSpotId: string;
  currentCategories: string[];
  instruction: string;
  walk: Spot[];
  exhibit: Spot[];
  sweets: Spot[];
  other: Spot[];
  heldIds: string[];
  rain: boolean;
  dateTokyo?: string;
  startTime?: string;
  endTime?: string;
}): string | null {
  const avoid = new Set([args.currentSpotId, ...args.heldIds]);
  const all = [...args.sweets, ...args.exhibit, ...args.walk, ...args.other];
  const usable = (list: Spot[]) =>
    list.filter((spot) => {
      if (avoid.has(spot.id)) return false;
      if (args.rain && spot.environment.value === "OUTDOOR") return false;
      if (closedForSession(spot, args.dateTokyo, args.startTime, args.endTime)) return false;
      return true;
    });
  const sameCategory = usable(all.filter((spot) => spot.categories.some((cat) => args.currentCategories.includes(cat))));
  const pool = sameCategory.length ? sameCategory : usable(all);
  const ranked = [...pool];
  if (/予算|安|抑え/.test(args.instruction)) {
    ranked.sort((a, b) => (a.costForTwoJpy.value?.max ?? 9_999_999) - (b.costForTwoJpy.value?.max ?? 9_999_999));
  }
  if (/ゆっくり|休憩/.test(args.instruction)) {
    ranked.sort((a, b) => Number(b.restEase.value === "EASY") - Number(a.restEase.value === "EASY"));
  }
  return ranked[0]?.id ?? null;
}

function deterministicLlm(
  selected: string[],
  rejected: { spotId: string; reason: string }[],
): LlmCallResult<{
  think?: string;
  selectedSpotIds: string[];
  rejected: { spotId: string; reason: string }[];
  assumptions: string[];
}> {
  return {
    data: {
      think: "外部取得済みの候補から決定論的に選ぶ",
      selectedSpotIds: selected,
      rejected,
      assumptions: ["外部取得済みの候補から決定論的に選んだ", "空席は確認していない"],
    },
    ok: true,
    requestedModel: "deterministic/planner",
    actualModel: "deterministic/planner",
    pool: "mundane",
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    costJpy: 0,
    latencyMs: 0,
    repaired: false,
    error: null,
  };
}

export async function runPlanner(input: {
  log: AgentLog;
  memories: AgentMemories;
  runId: string;
  task: "final_plan" | "replan";
  signal: AbortSignal;
  preferences: unknown;
  lockedIds: string[];
  lockedSpots?: Spot[];
  rain: boolean;
  memoriesForPrompt: Memory[];
  walk: Spot[];
  exhibit: Spot[];
  sweets: Spot[];
  other: Spot[];
  dateTokyo?: string;
  startTime?: string;
  endTime?: string;
  avoidIds?: string[];
  instruction?: string | null;
  /** AI HACK LIVE: keep catalog companion drink spots through live-only filtering. */
  allowDemoCatalogOnLive?: boolean;
}): Promise<{
  selected: string[];
  rejected: { spotId: string; reason: string }[];
  unmetMust: PlannerPreference[];
  overflowMust: PlannerPreference[];
  llm: LlmCallResult<{
    think?: string;
    selectedSpotIds: string[];
    rejected: { spotId: string; reason: string }[];
    assumptions: string[];
  }>;
}> {
  await input.log(
    "planner",
    "TOOL_STARTED",
    input.instruction ? `希望「${input.instruction}」を候補選定に使う` : "候補から行程の核を選ぶ",
  );
  const last = input.memories.planner?.facts[`last:${input.runId}`] as { selected?: string[] } | undefined;
  const avoidIds = input.avoidIds ?? [
    ...((input.memories.planner?.facts.lastSelected as string[] | undefined) ?? []),
    ...(last?.selected ?? []),
  ];
  const instruction = input.instruction ?? "";
  const rawPrefs = (input.preferences as { id?: string; content?: string; priority?: string }[] | undefined) ?? [];
  const preferences: PlannerPreference[] = rawPrefs
    .filter((item) => item.content?.trim())
    .map((item, index) => ({
      id: item.id?.trim() || `pref_${index}`,
      content: item.content!.trim(),
      priority: item.priority === "MUST" ? "MUST" : "PREFER",
    }));
  if (instruction.trim()) {
    preferences.push({
      id: "pref_instruction",
      content: instruction.trim(),
      priority: "PREFER",
    });
  }
  const wishText = preferences.map((item) => item.content).join("。");
  const fallback = pickFromCandidates({
    walk: input.walk,
    exhibit: input.exhibit,
    sweets: input.sweets,
    other: input.other,
    lockedIds: input.lockedIds,
    lockedSpots: input.lockedSpots,
    rain: input.rain,
    avoidIds,
    dateTokyo: input.dateTokyo,
    startTime: input.startTime,
    endTime: input.endTime,
    preferCheaper: /予算|安|抑え/.test(instruction),
    preferRest: /ゆっくり|休憩/.test(instruction),
    allowAvoidedFallback: input.task !== "replan",
    preferences,
    wishText,
  });
  const liveOnly = getEnv().runtime === "LIVE";
  const known = new Set(
    [
      ...(input.lockedSpots ?? []),
      ...input.walk,
      ...input.exhibit,
      ...input.sweets,
      ...input.other,
    ].map((s) => s.id),
  );
  const selected: string[] = [];
  for (const id of input.lockedIds) {
    if (!selected.includes(id)) selected.push(id);
  }
  for (const id of fallback.selected) {
    if (input.lockedIds.includes(id)) continue;
    const demoCompanionOk = input.allowDemoCatalogOnLive && isAiHackCompanionSpotId(id);
    if (!known.has(id) || (liveOnly && id.startsWith("mock:") && !demoCompanionOk)) {
      await input.log("planner", "CANDIDATE_REJECTED", `未知ID ${id} は採用しない`);
      continue;
    }
    if (!selected.includes(id)) selected.push(id);
  }
  for (const r of fallback.rejected) {
    await input.log("planner", "CANDIDATE_REJECTED", `${r.spotId}: ${r.reason}`);
  }
  if (fallback.unmetMust.length) {
    await input.log(
      "planner",
      "NOTICE",
      `未達 MUST: ${fallback.unmetMust.map((pref) => pref.content).join("、")}`,
    );
  }
  if (fallback.overflowMust.length) {
    await input.log(
      "planner",
      "NOTICE",
      `枠超過 MUST: ${fallback.overflowMust.map((pref) => pref.content).join("、")}`,
    );
  }

  remember(input.memories, "planner", {
    note: `選んだ ${selected.length}件 rain=${input.rain} ${input.task}`,
    factKey: "lastSelected",
    factValue: selected,
  });
  await input.log("planner", "TOOL_COMPLETED", `${selected.length}件を決定論で採用`);
  return {
    selected,
    rejected: fallback.rejected,
    unmetMust: fallback.unmetMust,
    overflowMust: fallback.overflowMust,
    llm: deterministicLlm(selected, fallback.rejected),
  };
}
