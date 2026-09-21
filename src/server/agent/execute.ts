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
import { callLLM, llmActionSchema } from "@/server/llm";
import type { ProviderCtx } from "@/server/providers";
import { attachSpotImages } from "@/server/providers/geminiGrounding";
import { appendRunEvent, getRun, nextEventSeq, patchRunDoc, withApproval, withRun } from "@/server/repositories/store";
import { heartbeat, claimRun, WORKER_ID } from "./lease";
import { orchestrateGather, orchestratePlanning } from "./orchestrate";
import { canReadMemory } from "@/domain/memory";
import type { AgentId } from "./types";

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
        imaged.queries.length
          ? `Gemini grounding でスポット画像 ${Object.values(imaged.spots).filter((s) => s.imageUrl).length} 件`
          : "スポット画像（Gemini 未設定または未ヒット）",
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

async function runReflection(runId: string, signal: AbortSignal) {
  const loaded = await getRun(runId);
  if (!loaded) return;
  const note = (loaded.run as Run & { reflectionNote?: string }).waitingQuestion
    ? null
    : loaded.run.waitingQuestion;

  if (!loaded.run.waitingQuestion) {
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
    await callLLM({
      task: "reflect",
      messages: [{ role: "user", content: "振り返りから確認質問を1つ" }],
      schema: llmActionSchema,
      runId,
      signal,
      mockValue: {
        selectedSpotIds: [],
        rejected: [],
        assumptions: [question.prompt],
      },
    });
    await patchRun(runId, { status: "WAITING_INPUT", waitingQuestion: question, leaseOwner: null });
    await appendEvent(runId, "INPUT_REQUIRED", question.prompt, { payload: question });
    return;
  }

  void note;
  await patchRun(runId, {
    status: "SUCCEEDED",
    finishedAt: realNowIso(),
    leaseOwner: null,
  });
  await appendEvent(runId, "RUN_FINISHED", "確認質問を作成済み");
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
