import { LIMITS } from "@/config/settings";
import { getEnv } from "@/config/env";
import { loadSelectedEventSpots } from "@/server/catalog/planAttach";
import type { Memory, Plan, Run, Session, Spot } from "@/domain/schemas";
import type { LlmCallResult } from "@/server/llm";
import type { ProviderCtx } from "@/server/providers";
import { findRun, withStore, type CoupleBundle } from "@/server/repositories/store";
import { dailyFresh, readMemories, remember, writeMemories } from "./memory";
import { buildPlan, type BuiltPlan } from "./buildPlan";
import { runPlace } from "./place";
import { runPlanner } from "./planner";
import { runScout } from "./scout";
import { noteTravelPass } from "./travel";
import type { AgentLog, AgentMemories } from "./types";
import { runWeather } from "./weather";

export type OrchestratedPlan = {
  built: BuiltPlan | null;
  waitingQuestion?: { id: string; prompt: string; options: string[] };
  llm: LlmCallResult<{
    think?: string;
    selectedSpotIds: string[];
    rejected: { spotId: string; reason: string }[];
    assumptions: string[];
  }>;
  mode: Plan["dataMode"];
};

export async function orchestratePlanning(input: {
  runId: string;
  ctx: ProviderCtx;
  log: AgentLog;
  signal: AbortSignal;
  couple: CoupleBundle;
  session: Session;
  run: Run;
  memories: Memory[];
}): Promise<OrchestratedPlan> {
  const env = getEnv();
  const memories = readMemories(input.couple);
  const overlays = input.ctx.overlays;
  const mode = overlays.length ? "LIVE_SCENARIO" : input.run.mode === "REPLAY" ? "REPLAY" : "LIVE";
  hydrateTravelCache(input.ctx, memories);

  const area = {
    lat: input.session.input.areaLat,
    lng: input.session.input.areaLng,
    name: input.session.input.areaName,
  };
  const scout = await runScout({
    ctx: input.ctx,
    log: input.log,
    memories,
    area,
    radiusMeters: input.session.input.radiusMeters,
  });
  const catalog = await loadSelectedEventSpots({
    enabled: env.enableEventCatalog,
    selectedEventIds: input.session.input.selectedEventIds ?? [],
    dateTokyo: input.session.input.dateTokyo,
    fallbackAcknowledged: input.session.input.eventFallbackAcknowledged,
  });
  if (catalog.failed.length) {
    await input.log(
      "planner",
      "NOTICE",
      catalog.failed.map((f) => `${f.id}: ${f.reason}`).join(" / "),
    );
  }
  if (catalog.needsConfirmation) {
    return {
      waitingQuestion: {
        id: "q_event_fallback",
        prompt: `選択したイベントを確定プランに使えません（${catalog.failed[0]?.reason ?? "取得失敗"}）。施設の候補で続けますか？黙って置き換えはしません。`,
        options: ["施設の候補で続ける", "中断する"],
      },
      built: null,
      llm: {
        data: { selectedSpotIds: [], rejected: [], assumptions: [] },
        ok: true,
        requestedModel: "none",
        actualModel: "none",
        pool: "mundane",
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
        costJpy: null,
        latencyMs: 0,
        repaired: false,
        error: null,
      },
      mode,
    };
  }
  const selected = input.session.input.selectedEventIds ?? [];
  const exhibit = catalog.spots.length
    ? [...catalog.spots, ...scout.exhibit.filter((s) => !catalog.spots.some((e) => e.id === s.id))]
    : selected.length === 0 || catalog.fallbackAcknowledged
      ? scout.exhibit
      : [];
  for (const [id, rules] of Object.entries(catalog.hours)) {
    input.ctx.placeHours = { ...(input.ctx.placeHours ?? {}), [id]: rules };
  }
  const weather = await runWeather({
    ctx: input.ctx,
    log: input.log,
    memories,
    lat: input.session.input.areaLat,
    lng: input.session.input.areaLng,
    at: `${input.session.input.dateTokyo}T${input.session.input.startTime}:00+09:00`,
  });
  const rain = weather.injected || (weather.precipitationMm ?? 0) >= 2;
  const lockedIds = [
    ...input.session.input.fixedAppointments.map((a) => a.spotId).filter((x): x is string => Boolean(x)),
    ...catalog.spots.map((s) => s.id),
  ];

  const planned = await runPlanner({
    log: input.log,
    memories,
    runId: input.runId,
    task: input.run.kind === "REPLAN" ? "replan" : "final_plan",
    signal: input.signal,
    preferences: input.session.input.preferences,
    lockedIds,
    rain,
    memoriesForPrompt: input.memories,
    walk: scout.walk,
    exhibit,
    sweets: scout.sweets,
    other: scout.other,
    dateTokyo: input.session.input.dateTokyo,
    startTime: input.session.input.startTime,
    endTime: input.session.input.endTime,
  });

  const spotMap: Record<string, Spot> = {};
  for (const s of [...scout.walk, ...exhibit, ...scout.sweets, ...scout.other, ...catalog.spots]) {
    spotMap[s.id] = s;
  }

  const detailed = await runPlace({
    ctx: input.ctx,
    log: input.log,
    memories,
    spotIds: planned.selected,
    spots: spotMap,
  });

  const current = input.session.currentPlanVersion
    ? input.couple.sessions[input.session.id]?.planHistory[String(input.session.currentPlanVersion)]
    : undefined;

  await input.log("travel", "TOOL_STARTED", "区間の移動時間を調べる");
  let built = await buildPlan({
    version: (current?.version ?? 0) + 1,
    input: input.session.input,
    orderedSpotIds: planned.selected,
    spots: detailed.spots,
    memories: input.memories,
    ctx: input.ctx,
    dataMode: overlays.length ? "LIVE_SCENARIO" : env.runtime === "MOCK" ? "LIVE" : "LIVE",
    previousItems: current?.items,
  });

  const travelUnknown = built.plan.validation.issues.filter((i) =>
    ["TRAVEL_UNKNOWN", "END_TRAVEL_UNKNOWN"].includes(i.code),
  ).length;
  await noteTravelPass({ log: input.log, memories, unknownCount: travelUnknown });

  const eventBlocked = built.plan.validation.issues.filter((i) =>
    ["EVENT_CLOSED", "EVENT_HOURS_OUTSIDE", "EVENT_UNKNOWN", "EVENT_HOURS_UNKNOWN", "EVENT_CLOSED_UNKNOWN"].includes(
      i.code,
    ),
  );
  if (eventBlocked.length && selected.length && !catalog.fallbackAcknowledged) {
    return {
      waitingQuestion: {
        id: "q_event_fallback",
        prompt: `選択したイベントを確定プランに使えません（${eventBlocked[0]?.message ?? "検証失敗"}）。施設の候補で続けますか？黙って置き換えはしません。`,
        options: ["施設の候補で続ける", "中断する"],
      },
      built: null,
      llm: planned.llm,
      mode,
    };
  }

  if (built.plan.validation.state === "FAIL" && input.ctx.httpAttempts < LIMITS.maxExternalHttpAttempts) {
    await input.log("planner", "VALIDATION_FAILED", "制約違反のため1回だけ組み直し");
    const closedSpotIds = new Set(
      built.plan.items
        .filter((item) =>
          built.plan.validation.issues.some((i) => i.code === "CLOSED" && i.itemIds.includes(item.id)),
        )
        .map((item) => item.spotId),
    );
    const retryIds = planned.selected.filter((id) => !closedSpotIds.has(id));
    const pool = [...scout.walk, ...exhibit, ...scout.sweets, ...scout.other];
    for (const spot of pool) {
      if (retryIds.length >= 3) break;
      if (retryIds.includes(spot.id) || closedSpotIds.has(spot.id)) continue;
      if (rain && spot.environment.value === "OUTDOOR") continue;
      retryIds.push(spot.id);
    }
    const retryPlace = await runPlace({
      ctx: input.ctx,
      log: input.log,
      memories,
      spotIds: retryIds,
      spots: { ...detailed.spots, ...built.spots },
    });
    built = await buildPlan({
      version: (current?.version ?? 0) + 1,
      input: input.session.input,
      orderedSpotIds: retryIds,
      spots: retryPlace.spots,
      memories: input.memories,
      ctx: input.ctx,
      dataMode: built.plan.dataMode,
      previousItems: current?.items,
    });
    await input.log("planner", "SELF_CORRECTED", "検証エラーを見て候補を差し替えた");
  }

  await withStore((db) => {
    const found = findRun(db, input.runId);
    if (!found) return;
    persistTravelCache(input.ctx, memories);
    writeMemories(found.couple, memories);
  });

  return { built, llm: planned.llm, mode: mode === "REPLAY" ? "LIVE" : mode };
}

export async function orchestrateGather(input: {
  runId: string;
  ctx: ProviderCtx;
  log: AgentLog;
  couple: CoupleBundle;
  session: Session;
}): Promise<{ rain: boolean; cached: boolean }> {
  const memories = readMemories(input.couple);
  const area = {
    lat: input.session.input.areaLat,
    lng: input.session.input.areaLng,
    name: input.session.input.areaName,
  };
  const hadDaily = Boolean(
    memories.scout?.facts.daily &&
      dailyFresh((memories.scout.facts.daily as { fetchedAt?: string }).fetchedAt),
  );
  await runScout({
    ctx: input.ctx,
    log: input.log,
    memories,
    area,
    radiusMeters: input.session.input.radiusMeters,
  });
  const weather = await runWeather({
    ctx: input.ctx,
    log: input.log,
    memories,
    lat: input.session.input.areaLat,
    lng: input.session.input.areaLng,
    at: `${input.session.input.dateTokyo}T${input.session.input.startTime}:00+09:00`,
  });
  await withStore((db) => {
    const found = findRun(db, input.runId);
    if (!found) return;
    writeMemories(found.couple, memories);
  });
  return {
    rain: weather.injected || (weather.precipitationMm ?? 0) >= 2,
    cached: hadDaily,
  };
}

function hydrateTravelCache(ctx: ProviderCtx, memories: AgentMemories) {
  for (const [key, raw] of Object.entries(memories.travel?.facts ?? {})) {
    if (!key.startsWith("travel:") || !raw || typeof raw !== "object") continue;
    const wrapped = raw as { fetchedAt?: string; payload?: unknown };
    if (!dailyFresh(wrapped.fetchedAt) || wrapped.payload == null) continue;
    ctx.cache.set(key, { at: wrapped.fetchedAt!, value: wrapped.payload, stale: false });
  }
}

function persistTravelCache(ctx: ProviderCtx, memories: AgentMemories) {
  for (const [key, hit] of ctx.cache) {
    if (!key.startsWith("travel:")) continue;
    remember(memories, "travel", {
      factKey: key,
      factValue: { fetchedAt: hit.at, payload: hit.value },
    });
  }
}
