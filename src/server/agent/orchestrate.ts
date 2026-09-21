import { LIMITS } from "@/config/settings";
import { getEnv } from "@/config/env";
import { loadSelectedEventSpots } from "@/server/catalog/planAttach";
import { suggestCatalogEventsForPlan } from "@/server/catalog/suggest";
import type { Memory, Plan, Run, Session, Spot } from "@/domain/schemas";
import { evaluateWalkLimits, describeWalkOverages, longWalkQuestion, travelUnverifiedQuestion, hasUnverifiedTravel, walkAckFingerprintFromPlan, walkLongAckMatches, resolveWalkHardTotal } from "@/domain/plan/walkLimits";
import { WALK_LIMITS } from "@/config/settings";
import { composeReplanOrder, isProtectedPlanItem } from "@/domain/plan/replanOrder";
import {
  classifyReplanIntent,
  replanNoChangeQuestion,
} from "@/domain/plan/replanIntent";
import type { LlmCallResult } from "@/server/llm";
import type { ProviderCtx } from "@/server/providers";
import { withRun, type CoupleBundle } from "@/server/repositories/store";
import { dailyFresh, pruneTravelFacts, readMemories, remember, writeMemories } from "./memory";
import { buildPlan, type BuiltPlan } from "./buildPlan";
import { runPlace } from "./place";
import { pickReplacementCandidate, runPlanner } from "./planner";
import { jobsMissingCoverage, mergeScoutBuckets, runScout, scoutPool } from "./scout";
import { scoutJobsForPreferences } from "./scoutJobs";
import {
  assessTokyoPlan,
  companionScoutJobs,
  outsideTokyoQuestion,
  searchRadiiFor,
  searchRangeQuestion,
  tokyoUnconfirmedQuestion,
} from "@/contracts/serviceArea";
import { noteTravelPass } from "./travel";
import type { AgentLog, AgentMemories } from "./types";
import { runWeather } from "./weather";

export type OrchestratedPlan = {
  built: BuiltPlan | null;
  waitingQuestion?: { id: string; prompt: string; options: string[] };
  walkAckFingerprint?: string;
  llm: LlmCallResult<{
    think?: string;
    selectedSpotIds: string[];
    rejected: { spotId: string; reason: string }[];
    assumptions: string[];
  }>;
  mode: Plan["dataMode"];
};

function noneLlm(): OrchestratedPlan["llm"] {
  return {
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
  };
}

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
  if (!input.session.input.tokyoAreaAcknowledged) {
    const areaCheck = assessTokyoPlan([
      {
        name: input.session.input.meet.name,
        lat: input.session.input.meet.lat,
        lng: input.session.input.meet.lng,
        address: input.session.input.meet.address,
      },
      {
        name: input.session.input.end.name,
        lat: input.session.input.end.lat,
        lng: input.session.input.end.lng,
        address: input.session.input.end.address,
      },
      ...input.session.input.fixedAppointments
        .filter((item) => item.spotNameHint)
        .map((item) => ({
          name: item.spotNameHint ?? item.label,
          lat: Number.NaN,
          lng: Number.NaN,
        })),
    ]);
    if (areaCheck.verdict === "outside") {
      return {
        waitingQuestion: outsideTokyoQuestion(areaCheck.outside.map((point) => point.name)),
        built: null,
        llm: noneLlm(),
        mode,
      };
    }
    if (areaCheck.verdict === "unknown") {
      return {
        waitingQuestion: tokyoUnconfirmedQuestion(areaCheck.unknown.map((point) => point.name)),
        built: null,
        llm: noneLlm(),
        mode,
      };
    }
  }
  const wish = scoutJobsForPreferences(input.session.input.preferences);
  if (wish.unsupported.length && !input.session.input.unsupportedWishAcknowledged) {
    const hasOnsen = wish.unsupported.includes("温泉");
    return {
      waitingQuestion: {
        id: "q_unsupported_wish",
        prompt: hasOnsen
          ? `「${wish.unsupported.join("、")}」は現在の Places type だけでは達成判定できません。温泉をスパとして探すか、対応できる範囲で続けますか？`
          : `「${wish.unsupported.join("、")}」はまだ候補検索に対応していません。対応できる範囲で続けますか？`,
        options: hasOnsen
          ? ["スパとして探す", "対応できる範囲で続ける", "中断する"]
          : ["対応できる範囲で続ける", "中断する"],
      },
      built: null,
      llm: noneLlm(),
      mode,
    };
  }
  const wishText = input.session.input.preferences.map((item) => item.content).join("。");
  const jobs = [...wish.jobs, ...companionScoutJobs(wish.jobs, wishText)];
  const radii = searchRadiiFor(input.session.input.travelMode, {
    expand: input.session.input.searchExpandAcknowledged ? false : true,
  });
  const scout: { walk: Spot[]; exhibit: Spot[]; sweets: Spot[]; other: Spot[] } = {
    walk: [],
    exhibit: [],
    sweets: [],
    other: [],
  };
  let usedRadius = radii[0] ?? 1200;
  let missing = jobs.map((job) => job.category);
  for (const [index, radiusMeters] of radii.entries()) {
    usedRadius = radiusMeters;
    const slice = await runScout({
      ctx: input.ctx,
      log: input.log,
      memories,
      area,
      radiusMeters,
      jobs,
      jobKey: `${wish.key}:r${radiusMeters}`,
      persist: index === 0,
    });
    mergeScoutBuckets(scout, slice);
    missing = jobsMissingCoverage(wish.jobs, scoutPool(scout));
    if (!missing.length) break;
    if (index < radii.length - 1) {
      await input.log(
        "scout",
        "NOTICE",
        `希望カテゴリ不足（${missing.join("、")}）。検索範囲を ${radiusMeters}m から ${radii[index + 1]}m へ広げる`,
      );
    }
  }
  if (missing.length && !input.session.input.searchExpandAcknowledged) {
    return {
      waitingQuestion: searchRangeQuestion(usedRadius),
      built: null,
      llm: noneLlm(),
      mode,
    };
  }
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
      llm: noneLlm(),
      mode,
    };
  }
  const selected = input.session.input.selectedEventIds ?? [];
  const autoCatalog = await suggestCatalogEventsForPlan({
    enabled: env.enableEventCatalog && selected.length === 0,
    dateTokyo: input.session.input.dateTokyo,
    areaHint: input.session.input.meet.name,
    wishText: input.session.input.preferences.map((p) => p.content).join(" "),
    excludeIds: selected,
    limit: 3,
  });
  if (autoCatalog.reasons.length) {
    await input.log(
      "planner",
      "NOTICE",
      `カタログ自動候補: ${autoCatalog.reasons.map((r) => `${r.eventId}(${r.reason})`).join(" / ")}`,
    );
  }
  const catalogSpots = [...catalog.spots, ...autoCatalog.spots.filter((s) => !catalog.spots.some((c) => c.id === s.id))];
  const exhibit = catalogSpots.length
    ? [...catalogSpots, ...scout.exhibit.filter((s) => !catalogSpots.some((e) => e.id === s.id))]
    : selected.length === 0 || catalog.fallbackAcknowledged
      ? scout.exhibit
      : [];
  for (const [id, rules] of Object.entries({ ...catalog.hours, ...autoCatalog.hours })) {
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
  const current = input.session.currentPlanVersion
    ? input.couple.sessions[input.session.id]?.planHistory[String(input.session.currentPlanVersion)]
    : undefined;
  const targetPlanItemId = input.run.targetPlanItemId ?? null;
  const intent = classifyReplanIntent(input.run.instruction, targetPlanItemId);
  const bundleSpots = input.couple.sessions[input.session.id]?.spots ?? {};
  if (input.run.kind === "REPLAN" && current && intent === "replace_place") {
    const extraWish = scoutJobsForPreferences([
      ...input.session.input.preferences,
      { content: input.run.instruction ?? "別の場所", priority: "PREFER" as const },
    ]);
    const extra = await runScout({
      ctx: input.ctx,
      log: input.log,
      memories,
      area,
      radiusMeters: input.session.input.radiusMeters,
      jobs: extraWish.jobs,
      jobKey: `replan:${targetPlanItemId ?? "all"}:${extraWish.key}`,
      persist: false,
    });
    for (const spot of extra.walk) {
      if (!scout.walk.some((s) => s.id === spot.id)) scout.walk.push(spot);
    }
    for (const spot of extra.exhibit) {
      if (!scout.exhibit.some((s) => s.id === spot.id)) scout.exhibit.push(spot);
    }
    for (const spot of extra.sweets) {
      if (!scout.sweets.some((s) => s.id === spot.id)) scout.sweets.push(spot);
    }
    for (const spot of extra.other) {
      if (!scout.other.some((s) => s.id === spot.id)) scout.other.push(spot);
    }
  }
  const protectedItems = (current?.items ?? []).filter((item) => {
    if (isProtectedPlanItem(item)) return true;
    if (input.run.kind === "REPLAN" && targetPlanItemId && item.id !== targetPlanItemId) return true;
    return false;
  });
  const lockedIds = [
    ...input.session.input.fixedAppointments.map((a) => a.spotId).filter((x): x is string => Boolean(x)),
    ...catalogSpots.map((s) => s.id),
    ...protectedItems.map((item) => item.spotId),
  ];
  const avoidIds =
    input.run.kind === "REPLAN" && current
      ? targetPlanItemId
        ? current.items.filter((item) => item.id === targetPlanItemId).map((item) => item.spotId)
        : current.items.filter((item) => !isProtectedPlanItem(item)).map((item) => item.spotId)
      : undefined;

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
    avoidIds,
    instruction: input.run.instruction,
  });
  if (env.runtime === "LIVE") {
    planned.selected = planned.selected.filter((id) => !id.startsWith("mock:"));
  }
  if (!planned.selected.length && !(input.run.kind === "REPLAN" && current && intent === "adjust_same_place")) {
    return {
      waitingQuestion: {
        id: "q_no_candidates",
        prompt: "この場所と希望では実在候補を行程に載せられません。場所か希望を変えますか？",
        options: ["条件を変える", "中断する"],
      },
      built: null,
      llm: planned.llm,
      mode,
    };
  }

  let orderedSpotIds = planned.selected;
  let adjustmentReasons: string[] = [];
  if (input.run.kind === "REPLAN" && current) {
    if (intent === "adjust_same_place") {
      orderedSpotIds = current.items.map((item) => item.spotId);
    } else if (targetPlanItemId) {
      const target = current.items.find((item) => item.id === targetPlanItemId);
      if (!target) {
        return {
          waitingQuestion: replanNoChangeQuestion(),
          built: null,
          llm: planned.llm,
          mode,
        };
      }
      if (isProtectedPlanItem(target)) {
        return {
          waitingQuestion: replanNoChangeQuestion(
            "固定・訪問中・完了済みの行程は変えられません。条件を変えますか？",
          ),
          built: null,
          llm: planned.llm,
          mode,
        };
      }
      const targetSpot =
        bundleSpots[target.spotId] ??
        [...scout.walk, ...exhibit, ...scout.sweets, ...scout.other].find((spot) => spot.id === target.spotId);
      const replacement = pickReplacementCandidate({
        currentSpotId: target.spotId,
        currentCategories: targetSpot?.categories ?? [],
        instruction: input.run.instruction ?? "",
        walk: scout.walk,
        exhibit: [...exhibit, ...scout.exhibit.filter((spot) => !exhibit.some((item) => item.id === spot.id))],
        sweets: scout.sweets,
        other: scout.other,
        heldIds: current.items.filter((item) => item.id !== target.id).map((item) => item.spotId),
        rain,
        dateTokyo: input.session.input.dateTokyo,
        startTime: input.session.input.startTime,
        endTime: input.session.input.endTime,
      });
      if (!replacement || (env.runtime === "LIVE" && replacement.startsWith("mock:"))) {
        return {
          waitingQuestion: replanNoChangeQuestion(),
          built: null,
          llm: planned.llm,
          mode,
        };
      }
      orderedSpotIds = current.items.map((item) => (item.id === target.id ? replacement : item.spotId));
      adjustmentReasons = ["指定した行程だけ差し替え。前後は必要な範囲だけ時刻と移動を再計算する"];
    } else {
      const composed = composeReplanOrder({
        currentItems: current.items,
        candidates: planned.selected,
        targetPlanItemId,
      });
      if (!composed.targetChanged) {
        return {
          waitingQuestion: replanNoChangeQuestion(),
          built: null,
          llm: planned.llm,
          mode,
        };
      }
      orderedSpotIds = composed.orderedSpotIds;
      adjustmentReasons = composed.adjustmentReasons;
    }
  }

  const spotMap: Record<string, Spot> = {};
  for (const s of [...scout.walk, ...exhibit, ...scout.sweets, ...scout.other, ...catalogSpots]) {
    spotMap[s.id] = s;
  }

  const detailed = await runPlace({
    ctx: input.ctx,
    log: input.log,
    memories,
    spotIds: [...new Set([...planned.selected, ...orderedSpotIds])],
    spots: spotMap,
  });

  await input.log("travel", "TOOL_STARTED", "区間の移動時間を調べる");
  let built = await buildPlan({
    version: (current?.version ?? 0) + 1,
    input: input.session.input,
    orderedSpotIds,
    spots: detailed.spots,
    memories: input.memories,
    ctx: input.ctx,
    dataMode: overlays.length ? "LIVE_SCENARIO" : env.runtime === "MOCK" ? "LIVE" : "LIVE",
    previousItems: current?.items,
  });
  if (input.run.instruction) {
    built.plan.assumptions = [
      `希望「${input.run.instruction}」を反映する`,
      ...adjustmentReasons,
      ...built.plan.assumptions,
    ];
  }

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
    const protectedSpotIds = new Set(protectedItems.map((item) => item.spotId));
    const retryIds = orderedSpotIds.filter(
      (id) => protectedSpotIds.has(id) || (!closedSpotIds.has(id) && !(env.runtime === "LIVE" && id.startsWith("mock:"))),
    );
    const pool = [...scout.walk, ...exhibit, ...scout.sweets, ...scout.other];
    for (const spot of pool) {
      if (retryIds.length >= Math.max(3, orderedSpotIds.length)) break;
      if (retryIds.includes(spot.id) || closedSpotIds.has(spot.id) || protectedSpotIds.has(spot.id)) continue;
      if (env.runtime === "LIVE" && spot.id.startsWith("mock:")) continue;
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
    if (input.run.instruction) {
      built.plan.assumptions = [
        "検証エラーのため、対象外の行程も必要な範囲だけ調整した",
        ...built.plan.assumptions,
      ];
    }
    await input.log("planner", "SELF_CORRECTED", "検証エラーを見て候補を差し替えた");
  }

  if (built.plan.validation.state === "FAIL") {
    const reason = built.plan.validation.issues[0]?.message ?? "制約を満たせません";
    return {
      waitingQuestion: {
        id: "q_plan_unmet",
        prompt: `実在候補では確定プランを作れません（${reason}）。条件を変えますか？検証は緩めていません。`,
        options: ["条件を変える", "中断する"],
      },
      built: null,
      llm: planned.llm,
      mode,
    };
  }

  const walkCheck = evaluateWalkLimits(input.session.input.travelMode, built.plan.legs, {
    hardTotalMinutes: resolveWalkHardTotal(input.memories).minutes ?? WALK_LIMITS.hardTotalMinutes,
    enforcePerLeg: input.session.input.travelMode === "WALK",
  });
  const hardFromMemory = resolveWalkHardTotal(input.memories);
  const fingerprint = walkAckFingerprintFromPlan(input.session, built.plan, walkCheck);
  if (walkCheck.exceeds && !walkLongAckMatches(input.session.walkLongAck, fingerprint, {
    hardTotalMinutes: walkCheck.hardTotalMinutes,
  })) {
    await withRun(input.runId, (found) => {
      if (!found) return;
      found.bundle.session.pendingWalkAckFingerprint = fingerprint;
      persistTravelCache(input.ctx, memories);
      writeMemories(found.couple, memories);
    });
    const details = describeWalkOverages(
      walkCheck,
      built.plan.legs,
      built.spots,
      { meetName: input.session.input.meet.name, endName: input.session.input.end.name },
    );
    return {
      waitingQuestion: longWalkQuestion(walkCheck, details, built.spots, {
        meetName: input.session.input.meet.name,
        endName: input.session.input.end.name,
      }),
      walkAckFingerprint: fingerprint,
      built: null,
      llm: planned.llm,
      mode,
    };
  }

  if (walkCheck.softTotalExceeded && !walkCheck.exceeds) {
    built.plan.assumptions = [
      `徒歩合計は ${walkCheck.totalMinutes}分（参考目安 ${walkCheck.softTotalMinutes}分を超過）。区間ごとの確認目安は超えていないため、合計だけでは止めていません。`,
      ...built.plan.assumptions,
    ];
  }
  if (hardFromMemory.memoryIds.length && walkCheck.hardTotalMinutes != null) {
    built.plan.assumptions = [
      `承認済みの総徒歩上限 ${walkCheck.hardTotalMinutes}分を適用（記憶 ${hardFromMemory.memoryIds.length} 件）`,
      ...built.plan.assumptions,
    ];
  }

  if (hasUnverifiedTravel(built.plan.validation.issues)) {
    const unknownCount = built.plan.validation.issues.filter((i) =>
      ["TRAVEL_UNKNOWN", "END_TRAVEL_UNKNOWN"].includes(i.code),
    ).length;
    built.plan.assumptions = [
      "移動を確認できていない暫定案です。必須区間の経路が取れるまで通常の確定はできません。",
      ...built.plan.assumptions,
    ];
    await withRun(input.runId, (found) => {
      if (!found) return;
      persistTravelCache(input.ctx, memories);
      writeMemories(found.couple, memories);
    });
    return {
      waitingQuestion: travelUnverifiedQuestion(unknownCount),
      built,
      llm: planned.llm,
      mode,
    };
  }

  await withRun(input.runId, (found) => {
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
  const wish = scoutJobsForPreferences(input.session.input.preferences);
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
    jobs: wish.jobs,
    jobKey: wish.key,
  });
  const weather = await runWeather({
    ctx: input.ctx,
    log: input.log,
    memories,
    lat: input.session.input.areaLat,
    lng: input.session.input.areaLng,
    at: `${input.session.input.dateTokyo}T${input.session.input.startTime}:00+09:00`,
  });
  await withRun(input.runId, (found) => {
    if (!found) return;
    writeMemories(found.couple, memories);
  });
  return {
    rain: weather.injected || (weather.precipitationMm ?? 0) >= 2,
    cached: hadDaily,
  };
}

function hydrateTravelCache(ctx: ProviderCtx, memories: AgentMemories) {
  if (memories.travel) memories.travel.facts = pruneTravelFacts(memories.travel.facts);
  for (const [key, raw] of Object.entries(memories.travel?.facts ?? {})) {
    if (!key.startsWith("travel:") || !raw || typeof raw !== "object") continue;
    const wrapped = raw as { fetchedAt?: string; payload?: unknown };
    if (!wrapped.fetchedAt || wrapped.payload == null) continue;
    ctx.cache.set(key, { at: wrapped.fetchedAt, value: wrapped.payload, stale: false });
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
  if (memories.travel) memories.travel.facts = pruneTravelFacts(memories.travel.facts);
}
