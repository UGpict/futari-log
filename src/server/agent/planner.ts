import { getEnv } from "@/config/env";
import type { Memory, Spot } from "@/domain/schemas";
import type { LlmCallResult } from "@/server/llm";
import { addMinutes, tokyoDateTime, toTokyoParts } from "@/lib/time";
import { getCatalogSpot } from "@/server/providers/catalog";
import { assessHours } from "@/server/providers/placeFacts";
import { remember } from "./memory";
import type { AgentLog, AgentMemories } from "./types";

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

export function pickFromCandidates(args: {
  walk: Spot[];
  exhibit: Spot[];
  sweets: Spot[];
  other: Spot[];
  lockedIds: string[];
  rain: boolean;
  avoidIds: string[];
  dateTokyo?: string;
  startTime?: string;
  endTime?: string;
}): { selected: string[]; rejected: { spotId: string; reason: string }[] } {
  const rejected: { spotId: string; reason: string }[] = [];
  const selected: string[] = [];
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
  for (const id of args.lockedIds) addId(id);
  const take = (list: Spot[]) => usable(list)[0] ?? usable(list, true)[0];
  addId(take(args.exhibit)?.id);
  addId(take(args.walk)?.id);
  addId(take(args.sweets)?.id);
  if (selected.length < 3) addId(take(args.other)?.id);
  if (selected.length < 3) {
    for (const s of [...args.exhibit, ...args.walk, ...args.sweets, ...args.other]) {
      addId(s.id);
      if (selected.length >= 3) break;
    }
  }
  return { selected: selected.slice(0, 4), rejected };
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
  rain: boolean;
  memoriesForPrompt: Memory[];
  walk: Spot[];
  exhibit: Spot[];
  sweets: Spot[];
  other: Spot[];
  dateTokyo?: string;
  startTime?: string;
  endTime?: string;
}): Promise<{
  selected: string[];
  rejected: { spotId: string; reason: string }[];
  llm: LlmCallResult<{
    think?: string;
    selectedSpotIds: string[];
    rejected: { spotId: string; reason: string }[];
    assumptions: string[];
  }>;
}> {
  await input.log("planner", "TOOL_STARTED", "候補から行程の核を選ぶ");
  const last = input.memories.planner?.facts[`last:${input.runId}`] as { selected?: string[] } | undefined;
  const avoidIds = [
    ...((input.memories.planner?.facts.lastSelected as string[] | undefined) ?? []),
    ...(last?.selected ?? []),
  ];
  const fallback = pickFromCandidates({
    walk: input.walk,
    exhibit: input.exhibit,
    sweets: input.sweets,
    other: input.other,
    lockedIds: input.lockedIds,
    rain: input.rain,
    avoidIds,
    dateTokyo: input.dateTokyo,
    startTime: input.startTime,
    endTime: input.endTime,
  });
  const liveOnly = getEnv().runtime === "LIVE";
  const known = new Set(
    [...input.walk, ...input.exhibit, ...input.sweets, ...input.other].map((s) => s.id),
  );
  const selected: string[] = [];
  for (const id of input.lockedIds) {
    if (!selected.includes(id)) selected.push(id);
  }
  for (const id of fallback.selected) {
    if (!known.has(id) || (liveOnly && id.startsWith("mock:"))) {
      await input.log("planner", "CANDIDATE_REJECTED", `未知ID ${id} は採用しない`);
      continue;
    }
    if (!selected.includes(id)) selected.push(id);
  }
  if (selected.length < 3) {
    for (const id of fallback.selected) {
      if (!selected.includes(id)) selected.push(id);
      if (selected.length >= 3) break;
    }
  }
  for (const r of fallback.rejected) {
    await input.log("planner", "CANDIDATE_REJECTED", `${r.spotId}: ${r.reason}`);
  }

  remember(input.memories, "planner", {
    note: `選んだ ${selected.length}件 rain=${input.rain} ${input.task}`,
    factKey: "lastSelected",
    factValue: selected,
  });
  await input.log("planner", "TOOL_COMPLETED", `${selected.length}件を決定論で採用`);
  return { selected, rejected: fallback.rejected, llm: deterministicLlm(selected, fallback.rejected) };
}
