import { DEADLINES_MS } from "@/config/settings";
import { getEnv } from "@/config/env";
import type {
  AppEvent,
  EventType,
  Run,
} from "@/domain/schemas";
import { diffPlan } from "@/domain/plan/diffPlan";
import { evaluateAutoApply } from "@/domain/plan/evaluateAutoApply";
import { classifyReplanIntent, replanNoChangeQuestion, replanRequestSatisfied } from "@/domain/plan/replanIntent";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import type { ProviderCtx } from "@/server/providers";
import { attachSpotImages } from "@/server/providers/geminiGrounding";
import { appendRunEvent, getRun, nextEventSeq, patchRunDoc, withApproval, withRun } from "@/server/repositories/store";
import { heartbeat, claimRun, WORKER_ID } from "./lease";
import { orchestrateGather, orchestratePlanning } from "./orchestrate";
import { canReadMemory } from "@/domain/memory";
import type { AgentId } from "./types";
import { enrichSpotPrice } from "@/server/catalog/priceEnrich";
import { placeIdFromPriceEnrichTrigger } from "@/server/catalog/enqueuePriceEnrich";
import { addDailyPriceEnrichCost } from "@/server/catalog/priceRepo";
import { tokyoToday } from "@/lib/time";

async function appendEvent(
  runId: string,
  type: EventType,
  summary: string,
  extra: Partial<AppEvent> = {},
) {
  const seq = await nextEventSeq(runId);
  const event: AppEvent = {
    eventId: newId("evt"),
    runId,
    seq,
    at: realNowIso(),
    type,
    summary,
    evidenceIds: extra.evidenceIds ?? [],
    model: extra.model ?? null,
    pool: extra.pool ?? null,
    requestedModel: extra.requestedModel ?? null,
    actualModel: extra.actualModel ?? null,
    usage: extra.usage ?? null,
    payload: extra.payload ?? null,
  };
  await appendRunEvent(runId, event);
}

async function patchRun(runId: string, patch: Partial<Run>) {
  await patchRunDoc(runId, patch);
}

function agentLog(runId: string): (agent: AgentId, type: EventType, summary: string, extra?: Partial<AppEvent>) => Promise<void> {
  return (agent, type, summary, extra = {}) => {
    const payload =
      extra.payload && typeof extra.payload === "object"
        ? { agent, ...(extra.payload as Record<string, unknown>) }
        : { agent };
    return appendEvent(runId, type, `[${agent}] ${summary}`, { ...extra, payload });
  };
}

export async function executeRun(
  runId: string,
  phase: "gather" | "propose" | "all" = "all",
): Promise<void> {
  const env = getEnv();
  const claimed = await claimRun(runId, phase === "all" ? WORKER_ID : "workflow");
  if (!claimed) return;
  const loaded = await getRun(runId);
  if (!loaded) return;
  const { run, bundle, couple } = loaded;
  const session = bundle.session;
  const overlays = Object.values(bundle.scenarios);
  const deadlineMs = DEADLINES_MS[run.kind];
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  const beat = setInterval(() => {
    void heartbeat(runId).catch(() => undefined);
  }, 5_000);

  const cache = new Map<string, { at: string; value: unknown; stale: boolean }>();
  const ctx: ProviderCtx = {
    runId,
    overlays,
    cache,
    httpAttempts: 0,
    placeHours: {},
    onHttp: (info) =>
      appendEvent(
        runId,
        info.cacheHit ? "CACHE_HIT" : "HTTP_ATTEMPT",
        info.cacheHit ? `${info.provider} キャッシュ` : `${info.provider} HTTP #${info.attempt}`,
        { payload: info },
      ),
  };

  await heartbeat(runId);

  try {
    if (run.kind === "REFLECTION") {
      if (phase === "gather") return;
      await runReflection(runId, controller.signal);
      return;
    }

    if (run.kind === "PRICE_ENRICH") {
      if (phase === "gather") return;
      await runPriceEnrich(runId, run, controller.signal);
      return;
    }

    const memories = Object.values(couple.memories).filter((m) =>
      canReadMemory(m, session.id),
    );
    const display = env.runtime === "MOCK" ? "MOCK" : run.displayRuntime;
    if (phase !== "propose") {
      await appendEvent(runId, "RUN_STARTED", `${run.kind} を開始`);
    }
    if (phase === "gather") {
      const gathered = await orchestrateGather({
        runId,
        ctx,
        log: agentLog(runId),
        couple,
        session,
      });
      await appendEvent(
        runId,
        gathered.cached ? "CACHE_HIT" : "TOOL_COMPLETED",
        gathered.cached ? "候補は本日取得済み" : "候補を取得して提案待ち",
        { payload: { agent: "scout", step: "gather" } },
      );
      return;
    }

    const planned = await orchestratePlanning({
      runId,
      ctx,
      log: agentLog(runId),
      signal: controller.signal,
      couple,
      session,
      run,
      memories,
    });
    if (planned.waitingQuestion) {
      const waitingQuestion = planned.waitingQuestion;
      if (planned.built) {
        const { built, llm } = planned;
        const display = overlays.length ? "LIVE_SCENARIO" : planned.mode;
        await appendEvent(runId, "MODEL_SELECTED", `${llm.pool} / ${llm.actualModel}`, {
          pool: llm.pool,
          model: llm.actualModel,
          requestedModel: llm.requestedModel,
          actualModel: llm.actualModel,
          usage: {
            promptTokens: llm.promptTokens,
            completionTokens: llm.completionTokens,
            costUsd: llm.costUsd,
            costJpy: llm.costJpy,
            latencyMs: llm.latencyMs,
            ok: llm.ok,
            retries: llm.retries,
            lastStatus: llm.lastStatus,
          },
          payload: { agent: "planner", provisional: true },
        });
        await withRun(runId, (found) => {
          if (!found) return;
          // displayRuntime は LIVE_SCENARIO を持たない（mode 側で区別）
          found.run.displayRuntime =
            env.runtime === "MOCK" ? "MOCK" : display === "REPLAY" ? "REPLAY" : "LIVE";
          found.run.mode = overlays.length ? "LIVE_SCENARIO" : found.run.mode;
          for (const ev of Object.values(built.evidence)) {
            found.bundle.evidence[ev.id] = ev;
          }
          Object.assign(found.bundle.spots, built.spots);
          found.bundle.planHistory[String(built.plan.version)] = built.plan;
          found.run.resultPlanVersion = built.plan.version;
          found.bundle.session.currentPlanVersion = built.plan.version;
        });
        await appendEvent(
          runId,
          "PLAN_APPLIED",
          `暫定行程 v${built.plan.version}（移動未検証・確定不可）`,
        );
      }
      await appendEvent(runId, "INPUT_REQUIRED", waitingQuestion.prompt, {
        payload: { agent: "planner" },
      });
      await withRun(runId, (found) => {
        if (!found) return;
        found.run.status = "WAITING_INPUT";
        found.run.waitingQuestion = waitingQuestion;
        found.run.leaseOwner = null;
        if (planned.walkAckFingerprint) {
          found.bundle.session.pendingWalkAckFingerprint = planned.walkAckFingerprint;
        }
      });
      return;
    }
    if (!planned.built) {
      await patchRun(runId, { status: "FAILED", error: "plan missing", finishedAt: realNowIso(), leaseOwner: null });
      return;
    }
    const { built, llm } = planned;
    if (built.plan.validation.state === "FAIL") {
      await appendEvent(runId, "VALIDATION_FAILED", "FAIL の行程は確定結果として保存しない");
      await patchRun(runId, {
        status: "FAILED",
        error: built.plan.validation.issues.map((i) => i.code).join(","),
        finishedAt: realNowIso(),
        leaseOwner: null,
      });
      return;
    }
    const mode = overlays.length ? "LIVE_SCENARIO" : planned.mode;

    await appendEvent(runId, "MODEL_SELECTED", `${llm.pool} / ${llm.actualModel}`, {
      pool: llm.pool,
      model: llm.actualModel,
      requestedModel: llm.requestedModel,
      actualModel: llm.actualModel,
      usage: {
        promptTokens: llm.promptTokens,
        completionTokens: llm.completionTokens,
        costUsd: llm.costUsd,
        costJpy: llm.costJpy,
        latencyMs: llm.latencyMs,
        ok: llm.ok,
        retries: llm.retries,
        lastStatus: llm.lastStatus,
      },
      payload: llm.error ? { error: llm.error, agent: "planner" } : { agent: "planner" },
    });
    await withRun(runId, (found) => {
      if (!found) return;
      const billed = llm.actualModel !== "deterministic/planner";
      if (billed) {
        found.run.cost.mundaneCalls += llm.pool === "mundane" ? 1 : 0;
        found.run.cost.hardCalls += llm.pool === "hard" ? 1 : 0;
        if (llm.costUsd == null && env.runtime === "LIVE") found.run.cost.unaccountedCalls += 1;
        if (llm.costUsd != null) {
          found.run.cost.llmUsd = (found.run.cost.llmUsd ?? 0) + llm.costUsd;
        }
        if (llm.costJpy != null) {
          found.run.cost.llmJpy = (found.run.cost.llmJpy ?? 0) + llm.costJpy;
        }
      }
    });

    if (controller.signal.aborted || Date.now() - started > deadlineMs) {
      await appendEvent(runId, "TIME_BUDGET_REACHED", "期限のため暫定案は確定しない");
      await patchRun(runId, {
        status: "PARTIAL",
        finishedAt: realNowIso(),
        error: "time budget",
        leaseOwner: null,
      });
      return;
    }

    const current = session.currentPlanVersion
      ? bundle.planHistory[String(session.currentPlanVersion)]
      : undefined;

    if (run.kind === "REPLAN" && current) {
      const d = diffPlan(current, built.plan);
      if (
        run.instruction &&
        !replanRequestSatisfied({
          intent: classifyReplanIntent(run.instruction, run.targetPlanItemId),
          previous: current,
          next: built.plan,
          diff: d,
          targetPlanItemId: run.targetPlanItemId,
        })
      ) {
        const question = replanNoChangeQuestion();
        await appendEvent(runId, "INPUT_REQUIRED", question.prompt, {
          payload: { agent: "planner", diff: d },
        });
        await withRun(runId, (found) => {
          if (!found) return;
          found.run.status = "WAITING_INPUT";
          found.run.waitingQuestion = question;
          found.run.waitingApprovalId = null;
          found.run.leaseOwner = null;
        });
        return;
      }
    }

    if (!controller.signal.aborted && Date.now() - started < deadlineMs - 8000) {
      const imaged = await attachSpotImages({
        ctx,
        spots: built.spots,
        areaName: session.input.areaName,
        signal: controller.signal,
      });
      built.spots = imaged.spots;
      Object.assign(built.evidence, imaged.evidence);
      await appendEvent(
        runId,
        "HTTP_ATTEMPT",
        "スポット画像（Places。未取得はプレースホルダ。Gemini grounding は同期では呼ばない）",
        {
          payload: { queries: imaged.queries, providers: Object.values(imaged.spots).map((s) => s.imageProvider) },
        },
      );
    }

    await withRun(runId, (found) => {
      if (!found) return;
      found.run.displayRuntime = env.runtime === "MOCK" ? "MOCK" : display;
      found.run.mode = mode === "LIVE_SCENARIO" ? "LIVE_SCENARIO" : found.run.mode;
      for (const ev of Object.values(built.evidence)) {
        found.bundle.evidence[ev.id] = ev;
      }
      Object.assign(found.bundle.spots, built.spots);
      found.bundle.planHistory[String(built.plan.version)] = built.plan;
      found.run.resultPlanVersion = built.plan.version;
    });

    if (run.kind === "REPLAN" && current) {
      const d = diffPlan(current, built.plan);
      const userRequested = Boolean(run.instruction);
      const auto = userRequested
        ? { apply: false as const, reasons: ["変更希望の確認が必要です"] }
        : evaluateAutoApply({
            previous: current,
            next: built.plan,
            diff: d,
            policy: session.input.autoApply,
            nowIso: realNowIso(),
            expectedBaseVersion: run.basePlanVersion ?? current.version,
          });
      if (auto.apply) {
        await withRun(runId, (found) => {
          if (!found) return;
          found.bundle.session.currentPlanVersion = built.plan.version;
          found.run.status = "SUCCEEDED";
          found.run.finishedAt = realNowIso();
          found.run.leaseOwner = null;
        });
        await appendEvent(runId, "PLAN_AUTO_APPLIED", `AUTO_NOTIFY: ${d.summary}`, {
          payload: { diff: d, reasons: auto.reasons },
        });
        await appendEvent(runId, "RUN_FINISHED", "自動適用して完了");
        return;
      }
      const approvalId = newId("appr");
      await withRun(runId, (found) => {
        if (!found) return;
        found.couple.approvals[approvalId] = {
          id: approvalId,
          coupleId: found.couple.couple.id,
          sessionId: found.bundle.session.id,
          runId,
          planVersionFrom: current.version,
          planVersionTo: built.plan.version,
          kind: "PLAN_APPLY",
          status: "PENDING",
          summary: `${d.summary}。${auto.reasons.join(" / ")}`,
          diff: d,
          consumedAt: null,
          createdAt: realNowIso(),
        };
        found.run.status = "WAITING_APPROVAL";
        found.run.waitingApprovalId = approvalId;
        found.run.leaseOwner = null;
      });
      await appendEvent(runId, "APPROVAL_REQUIRED", auto.reasons.join(" / "), {
        payload: { approvalId, diff: d },
      });
      return;
    }

    await withRun(runId, (found) => {
      if (!found) return;
      found.bundle.session.currentPlanVersion = built.plan.version;
      if (found.bundle.session.status === "DRAFT" && run.kind !== "REPLAN") {
        found.bundle.session.status = "DRAFT";
      }
      found.run.status = "SUCCEEDED";
      found.run.finishedAt = realNowIso();
      found.run.leaseOwner = null;
    });
    await appendEvent(runId, "PLAN_APPLIED", `行程 v${built.plan.version} を作成`);
    await appendEvent(runId, "RUN_FINISHED", "完了");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await patchRun(runId, {
      status: controller.signal.aborted ? "PARTIAL" : "FAILED",
      error: message,
      finishedAt: realNowIso(),
      leaseOwner: null,
    });
    await appendEvent(runId, "RUN_FINISHED", message);
  } finally {
    clearInterval(beat);
    clearTimeout(timer);
  }
}

async function runPriceEnrich(runId: string, run: Run, signal: AbortSignal) {
  await appendEvent(runId, "RUN_STARTED", "PRICE_ENRICH を開始");
  type Payload = {
    placeId: string;
    venueName: string;
    websiteUri?: string | null;
    address?: string | null;
  };
  let payload: Payload | null = null;
  try {
    if (run.instruction) payload = JSON.parse(run.instruction) as Payload;
  } catch {
    payload = null;
  }
  const placeId = payload?.placeId ?? placeIdFromPriceEnrichTrigger(run.trigger);
  const venueName = payload?.venueName;
  if (!placeId || !venueName) {
    await patchRun(runId, {
      status: "FAILED",
      error: "price enrich payload missing",
      finishedAt: realNowIso(),
      leaseOwner: null,
    });
    await appendEvent(runId, "NOTICE", "placeId/venueName missing");
    return;
  }
  if (signal.aborted) {
    await patchRun(runId, {
      status: "INTERRUPTED",
      error: "deadline",
      finishedAt: realNowIso(),
      leaseOwner: null,
    });
    return;
  }
  const result = await enrichSpotPrice({
    placeId,
    venueName,
    websiteUri: payload?.websiteUri,
    address: payload?.address,
    reason: "price_enrich_run",
    owner: `run:${runId}`,
  });
  const enrichCostUsd = result.costUsd ?? 0;
  if (enrichCostUsd > 0) await addDailyPriceEnrichCost(tokyoToday(), enrichCostUsd);

  if (result.ok) {
    await withRun(runId, (found) => {
      if (!found) return;
      found.run.status = "SUCCEEDED";
      found.run.finishedAt = realNowIso();
      found.run.leaseOwner = null;
      found.run.error = null;
      if (enrichCostUsd > 0) {
        found.run.cost.llmUsd = (found.run.cost.llmUsd ?? 0) + enrichCostUsd;
        found.run.cost.hardCalls += 1;
      }
    });
    await appendEvent(runId, "RUN_FINISHED", `料金事実 ${result.factsSaved}件を保存`, {
      payload: { enrichRunId: result.runId, status: result.status, factsSaved: result.factsSaved },
    });
  } else {
    await withRun(runId, (found) => {
      if (!found) return;
      found.run.status = "FAILED";
      found.run.finishedAt = realNowIso();
      found.run.leaseOwner = null;
      found.run.error = result.error ?? result.status;
      if (enrichCostUsd > 0) {
        found.run.cost.llmUsd = (found.run.cost.llmUsd ?? 0) + enrichCostUsd;
        found.run.cost.hardCalls += 1;
      }
    });
    await appendEvent(runId, "NOTICE", result.error ?? result.status, {
      payload: { enrichRunId: result.runId, status: result.status },
    });
  }
}

async function runReflection(runId: string, signal: AbortSignal) {
  const loaded = await getRun(runId);
  if (!loaded) return;
  const reflectionId = loaded.run.reflectionId;
  const contentVersion = loaded.run.reflectionContentVersion;

  // 旧: reflectionId なし → 固定質問（互換）。新分析は reflectionId 必須。
  if (!reflectionId) {
    const question = {
      id: newId("q"),
      prompt: "展示の途中で疲れていたとのこと。相手が何を大変そうにしていたか、いちばん近いものは？",
      options: [
        "長く立つのがしんどいと言っていた",
        "歩く距離が長かった",
        "分からない",
        "保存しない",
      ],
    };
    await patchRun(runId, { status: "WAITING_INPUT", waitingQuestion: question, leaseOwner: null });
    await appendEvent(runId, "INPUT_REQUIRED", question.prompt, { payload: question });
    return;
  }

  const reflection = loaded.couple.reflections[reflectionId];
  if (!reflection) {
    await patchRun(runId, {
      status: "FAILED",
      error: "reflection missing",
      finishedAt: realNowIso(),
      leaseOwner: null,
    });
    return;
  }
  if (contentVersion != null && reflection.contentVersion !== contentVersion) {
    await patchRun(runId, {
      status: "CANCELLED",
      error: "stale reflection content version",
      finishedAt: realNowIso(),
      leaseOwner: null,
    });
    await appendEvent(runId, "RUN_FINISHED", "本文が更新されたため旧分析を打ち切り");
    return;
  }

  const plan = loaded.bundle.session.currentPlanVersion
    ? loaded.bundle.planHistory[String(loaded.bundle.session.currentPlanVersion)]
    : null;
  const planSummary = plan
    ? plan.items
        .map((it) => {
          const spot = loaded.bundle.spots[it.spotId];
          const visit = reflection.visits?.find((v) => v.planItemId === it.id);
          return `${spot?.name ?? it.spotId} visited=${visit?.visited ?? "unknown"}`;
        })
        .join(" / ")
    : "no plan";

  const approved = Object.values(loaded.couple.memories)
    .filter((m) => m.active)
    .map((m) => ({ id: m.id, content: m.content, sourceType: m.sourceType }));

  const { analyzeReflectionNote, newAnalysisQuestionId } = await import("./reflectAnalyze");
  const followUp = loaded.run.instruction;
  const { action, llm } = await analyzeReflectionNote({
    runId,
    maskedNote: reflection.maskedNote,
    title: reflection.title,
    mood: reflection.mood,
    visits: (reflection.visits ?? []).map((v) => ({
      spotId: v.spotId,
      visited: v.visited,
      rating: v.rating,
    })),
    planSummary,
    approvedMemories: approved,
    followUpAnswer: followUp,
    signal,
  });

  await appendEvent(runId, "MODEL_SELECTED", `${llm.pool} / ${llm.actualModel}`, {
    pool: llm.pool,
    model: llm.actualModel,
    requestedModel: llm.requestedModel,
    actualModel: llm.actualModel,
    usage: {
      promptTokens: llm.promptTokens,
      completionTokens: llm.completionTokens,
      costUsd: llm.costUsd,
      costJpy: llm.costJpy,
      latencyMs: llm.latencyMs,
      ok: llm.ok,
      retries: llm.retries,
      lastStatus: llm.lastStatus,
    },
    payload: { agent: "reflect", action: action?.action ?? null },
  });

  await withRun(runId, (found) => {
    if (!found) return;
    if (llm.ok && llm.costJpy != null) {
      found.run.cost.llmJpy = (found.run.cost.llmJpy ?? 0) + llm.costJpy;
      found.run.cost.mundaneCalls += llm.pool === "mundane" ? 1 : 0;
      found.run.cost.hardCalls += llm.pool === "hard" ? 1 : 0;
    } else if (llm.ok) {
      found.run.cost.unaccountedCalls += 1;
    }
  });

  if (!action || !llm.ok) {
    await withRun(runId, (found) => {
      if (!found) return;
      const r = found.couple.reflections[reflectionId];
      if (r && r.contentVersion === reflection.contentVersion) {
        r.analysisStatus = "FAILED";
        r.analysisError = llm.error ?? "analysis failed";
        r.updatedAt = realNowIso();
      }
      found.run.status = "FAILED";
      found.run.error = llm.error ?? "analysis failed";
      found.run.finishedAt = realNowIso();
      found.run.leaseOwner = null;
    });
    await appendEvent(runId, "RUN_FINISHED", "振り返り分析失敗（本文は保持）");
    return;
  }

  if (action.action === "ASK_ONE" && action.question?.prompt) {
    const question = {
      id: newAnalysisQuestionId(),
      prompt: action.question.prompt,
      options: action.question.options?.length
        ? action.question.options
        : ["はい", "いいえ", "分からない"],
    };
    await withRun(runId, (found) => {
      if (!found) return;
      const r = found.couple.reflections[reflectionId];
      if (r && r.contentVersion === reflection.contentVersion) {
        r.analysisStatus = "WAITING_INPUT";
        r.updatedAt = realNowIso();
      }
      found.run.status = "WAITING_INPUT";
      found.run.waitingQuestion = question;
      found.run.instruction = null;
      found.run.leaseOwner = null;
    });
    await appendEvent(runId, "INPUT_REQUIRED", question.prompt, {
      payload: { agent: "reflect", question },
    });
    return;
  }

  await withRun(runId, (found) => {
    if (!found) return;
    const r = found.couple.reflections[reflectionId];
    if (!r || r.contentVersion !== reflection.contentVersion) {
      found.run.status = "CANCELLED";
      found.run.error = "stale reflection content version";
      found.run.finishedAt = realNowIso();
      found.run.leaseOwner = null;
      return;
    }

    if (action.action === "CREATE_CANDIDATES") {
      for (const c of action.candidates) {
        if (c.sourceType === "HYPOTHESIS") continue;
        // HARD は曖昧観察から自動作成しない
        const strength = c.strength === "HARD" && c.sourceType === "OBSERVATION" ? "SOFT" : c.strength;
        const cid = newId("mc");
        found.couple.memoryCandidates[cid] = {
          id: cid,
          coupleId: found.couple.couple.id,
          sessionId: found.bundle.session.id,
          reflectionId,
          reflectionVersion: r.contentVersion,
          answerId: followUp ? "followup" : null,
          subject: c.subject,
          type: c.type,
          content: c.content,
          sourceType: c.sourceType,
          evidenceQuote: c.evidenceQuote,
          strength,
          scope: c.scope,
          planDirectives: c.planDirectives ?? [],
          createdAt: realNowIso(),
        };
        const approvalId = newId("appr");
        found.couple.approvals[approvalId] = {
          id: approvalId,
          coupleId: found.couple.couple.id,
          sessionId: found.bundle.session.id,
          runId,
          planVersionFrom: found.bundle.session.currentPlanVersion ?? 0,
          planVersionTo: found.bundle.session.currentPlanVersion ?? 0,
          kind: "MEMORY_SAVE",
          status: "PENDING",
          summary: `記憶候補: ${c.content}`,
          targetCandidateId: cid,
          targetMemoryId: null,
          expectedVersion: null,
          diff: null,
          consumedAt: null,
          createdAt: realNowIso(),
        };
      }
    }

    r.analysisStatus = "SUCCEEDED";
    r.analysisError = null;
    r.updatedAt = realNowIso();
    found.bundle.session.status = "REFLECTED";
    found.run.status = "SUCCEEDED";
    found.run.finishedAt = realNowIso();
    found.run.waitingQuestion = null;
    found.run.leaseOwner = null;
    found.run.instruction = null;
  });
  await appendEvent(
    runId,
    "RUN_FINISHED",
    action.action === "CREATE_CANDIDATES"
      ? `記憶候補 ${action.candidates.length} 件（承認待ち）`
      : action.note ?? action.action,
  );
}

export async function applyApproval(input: {
  approvalId: string;
  uid: string;
  decision: "APPROVE" | "REJECT";
}) {
  return withApproval(input.approvalId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== input.uid) {
      return { ok: false as const, status: 404, error: "not found" };
    }
    const approval = found.approval;
    if (approval.status !== "PENDING") {
      return { ok: false as const, status: 409, error: "already consumed" };
    }
    const bundle = found.couple.sessions[approval.sessionId];
    if (!bundle) return { ok: false as const, status: 404, error: "session" };
    if (bundle.session.currentPlanVersion !== approval.planVersionFrom) {
      return { ok: false as const, status: 409, error: "stale version" };
    }
    approval.status = input.decision === "APPROVE" ? "CONSUMED" : "REJECTED";
    approval.consumedAt = realNowIso();
    const run = bundle.runs[approval.runId];
    if (input.decision === "APPROVE") {
      bundle.session.currentPlanVersion = approval.planVersionTo;
      if (run) {
        run.status = "SUCCEEDED";
        run.finishedAt = realNowIso();
      }
    } else if (run) {
      run.status = "CANCELLED";
      run.finishedAt = realNowIso();
    }
    return { ok: true as const, approval };
  });
}
