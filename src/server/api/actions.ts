import { getEnv, publicBlockers } from "@/config/env";
import {
  planningInputSchema,
  type PlanningInput,
  type RunKind,
  type ScenarioKind,
} from "@/domain/schemas";
import { candidateToMemory } from "@/domain/memory";
import { maskPii } from "@/server/privacy/mask";
import { draftShareMessage } from "@/server/privacy/dto";
import { demoAllowed } from "@/server/auth";
import { newId, sha256 } from "@/lib/ids";
import { realNowIso, tokyoDateTime } from "@/lib/time";
import {
  demoResetStore,
  emptyCoupleBundle,
  getReplayFromStore,
  getRun,
  getSession,
  insertPendingRun,
  listCalendarRows,
  loadCouple,
  ownerCoupleIdFromStore,
  putCouple,
  withApproval,
  withCouple,
  withMemory,
  withRun,
  withSession,
  type CoupleBundle,
  type SessionBundle,
} from "@/server/repositories/store";
import { getCatalogSpot } from "@/server/providers/catalog";
import { searchPlacesByText } from "@/server/providers";
import { presentMemoryList, presentReplay, presentRunView, presentSessionSnapshot } from "@/server/api/presenters";
import { calendarListResponseSchema } from "@/contracts/calendar";
import { placeSearchResponseSchema } from "@/contracts/places";

function gitSha(): string | null {
  return process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null;
}

export function snapshotOf(couple: CoupleBundle, bundle: SessionBundle) {
  const env = getEnv();
  const plan = bundle.session.currentPlanVersion
    ? bundle.planHistory[String(bundle.session.currentPlanVersion)]
    : null;
  const runs = Object.values(bundle.runs).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const events = Object.values(bundle.events).sort((a, b) => a.seq - b.seq);
  const approvals = Object.values(couple.approvals).filter((a) => a.sessionId === bundle.session.id);
  return {
    runtime: env.runtime,
    emulator: env.emulator,
    dataBackend: env.dataBackend,
    authBackend: env.authBackend,
    blockers: publicBlockers(),
    couple: couple.couple,
    session: bundle.session,
    plan,
    spots: bundle.spots,
    evidence: bundle.evidence,
    runs,
    events,
    approvals,
    memories: Object.values(couple.memories),
    memoryCandidates: Object.values(couple.memoryCandidates),
    scenarios: Object.values(bundle.scenarios),
    overlays: Object.values(bundle.scenarios).map((s) => s.kind),
  };
}

export async function createCouple(uid: string, isDemo: boolean) {
  const id = newId("cpl");
  await putCouple(
    emptyCoupleBundle({ id, ownerUid: uid, isDemo, createdAt: realNowIso() }),
  );
  return { id };
}

export async function createSession(uid: string, coupleId: string, raw: unknown) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false as const, status: 400, error: "invalid json" };
  }
  const parsed = planningInputSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.length ? issue.path.join(".") : "body"}: ${issue.message}`)
      .join("; ");
    return { ok: false as const, status: 400, error: detail || "invalid" };
  }
  const env = getEnv();
  if (env.runtime === "LIVE") {
    for (const point of [parsed.data.meet, parsed.data.end]) {
      if (!point.spotId) {
        return { ok: false as const, status: 400, error: "集合・解散は候補から選んでください。座標の補完はしません" };
      }
      if (point.spotId.startsWith("mock:")) {
        return { ok: false as const, status: 400, error: "LIVE ではモック地点を使えません" };
      }
    }
  }
  const input = env.runtime === "MOCK" ? resolveFixedSpot(parsed.data) : parsed.data;
  return withCouple(coupleId, (couple) => {
    if (!couple) return { ok: false as const, status: 404, error: "couple not found" };
    if (couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const id = newId("ses");
    const bundle: SessionBundle = {
      session: {
        id,
        coupleId,
        ownerUid: uid,
        status: "DRAFT",
        input,
        currentPlanVersion: null,
        currentLocation: null,
        scheduleNow: null,
        isDemo: couple.couple.isDemo,
        createdAt: realNowIso(),
        walkLongAck: null,
        pendingWalkAckFingerprint: null,
      },
      planHistory: {},
      runs: {},
      events: {},
      scenarios: {},
      spots: {},
      evidence: {},
    };
    couple.sessions[id] = bundle;
    for (const memory of Object.values(couple.memories)) {
      if (
        memory.active &&
        memory.scope === "NEXT_DATE" &&
        memory.targetSessionId == null
      ) {
        memory.targetSessionId = id;
      }
    }
    return { ok: true as const, id, input };
  });
}

function resolveFixedSpot(input: PlanningInput): PlanningInput {
  const catalog = [
    getCatalogSpot("mock:aichi-art-museum"),
    getCatalogSpot("mock:science-museum"),
    getCatalogSpot("mock:nagoya-castle"),
    getCatalogSpot("mock:komeda-meieki"),
    getCatalogSpot("mock:noritake-garden"),
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));
  return {
    ...input,
    fixedAppointments: input.fixedAppointments.map((a) => {
      if (a.spotId) return a;
      const hint = a.spotNameHint ?? a.label;
      const byName = catalog.find(
        (s) => hint.includes(s.name) || s.name.includes(hint.replace(/の予定/, "")),
      );
      return { ...a, spotId: byName?.id ?? a.spotId };
    }),
  };
}

export async function startRun(input: {
  uid: string;
  sessionId: string;
  kind: RunKind;
  trigger?: string | null;
  idempotencyKey?: string | null;
  bodyHash: string;
}) {
  return insertPendingRun(input);
}

export async function getSessionSnapshot(uid: string, sessionId: string) {
  const found = await getSession(sessionId);
  if (!found) return { ok: false as const, status: 404, error: "not found" };
  if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
  return { ok: true as const, data: presentSessionSnapshot(snapshotOf(found.couple, found.bundle)) };
}

export async function listCalendarPlans(
  uid: string,
  coupleId: string,
  range: { from?: string | null; to?: string | null },
) {
  const result = await listCalendarRows(uid, coupleId, range);
  if (!result.ok) return result;
  return {
    ok: true as const,
    data: calendarListResponseSchema.parse({
      plans: result.plans,
      from: range.from ?? null,
      to: range.to ?? null,
      state: result.plans.length ? "ok" : "empty",
      draftPolicy: "listed_when_plan_exists",
    }),
  };
}

export async function searchPlaces(uid: string, query: string, lat?: number, lng?: number) {
  void uid;
  const result = await searchPlacesByText({ query, lat, lng });
  return { ok: true as const, data: placeSearchResponseSchema.parse(result) };
}

export async function getRunView(uid: string, runId: string) {
  const found = await getRun(runId);
  if (!found) return { ok: false as const, status: 404, error: "not found" };
  if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
  const events = Object.values(found.bundle.events)
    .filter((e) => e.runId === runId)
    .sort((a, b) => a.seq - b.seq);
  return {
    ok: true as const,
    ...presentRunView({
      ok: true,
      run: found.run,
      events,
    }),
  };
}

export async function answerQuestion(uid: string, runId: string, questionId: string, answer: string) {
  const result = await withRun(runId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found", restart: false };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden", restart: false };
    if (found.run.status !== "WAITING_INPUT" || found.run.waitingQuestion?.id !== questionId) {
      return { ok: false as const, status: 409, error: "question mismatch", restart: false };
    }
    if (questionId === "q_event_fallback") {
      if (answer === "施設の候補で続ける") {
        found.bundle.session.input = { ...found.bundle.session.input, eventFallbackAcknowledged: true };
        found.run.status = "PENDING";
        found.run.waitingQuestion = null;
        found.run.leaseOwner = null;
        return { ok: true as const, restart: true, sessionId: found.bundle.session.id };
      }
      found.run.status = "CANCELLED";
      found.run.finishedAt = realNowIso();
      found.run.waitingQuestion = null;
      found.run.leaseOwner = null;
      found.run.error = "selected event unavailable; user cancelled";
      return { ok: true as const, restart: false };
    }
    if (questionId === "q_unsupported_wish" && answer === "対応できる範囲で続ける") {
      found.bundle.session.input = { ...found.bundle.session.input, unsupportedWishAcknowledged: true };
      found.run.status = "PENDING";
      found.run.waitingQuestion = null;
      found.run.leaseOwner = null;
      return { ok: true as const, restart: true, sessionId: found.bundle.session.id };
    }
    if (questionId === "q_unsupported_wish" || questionId === "q_plan_unmet" || questionId === "q_no_candidates") {
      found.run.status = "CANCELLED";
      found.run.finishedAt = realNowIso();
      found.run.waitingQuestion = null;
      found.run.leaseOwner = null;
      found.run.error = answer;
      return { ok: true as const, restart: false };
    }
    if (questionId === "q_long_walk") {
      if (answer === "このまま徒歩で続ける") {
        const fingerprint =
          found.bundle.session.pendingWalkAckFingerprint ??
          [
            found.bundle.session.input.dateTokyo,
            found.bundle.session.input.travelMode,
            found.bundle.session.input.meet.spotId ?? "",
            found.bundle.session.input.end.spotId ?? "",
          ].join("|");
        found.bundle.session.walkLongAck = { fingerprint, at: realNowIso() };
        found.bundle.session.pendingWalkAckFingerprint = null;
        found.run.status = "PENDING";
        found.run.waitingQuestion = null;
        found.run.leaseOwner = null;
        return { ok: true as const, restart: true, sessionId: found.bundle.session.id };
      }
      if (answer === "公共交通を使う") {
        found.bundle.session.input = { ...found.bundle.session.input, travelMode: "TRANSIT" };
        found.bundle.session.walkLongAck = null;
        found.bundle.session.pendingWalkAckFingerprint = null;
        found.run.status = "PENDING";
        found.run.waitingQuestion = null;
        found.run.leaseOwner = null;
        return { ok: true as const, restart: true, sessionId: found.bundle.session.id };
      }
      found.run.status = "CANCELLED";
      found.run.finishedAt = realNowIso();
      found.run.waitingQuestion = null;
      found.run.leaseOwner = null;
      found.run.error = answer;
      return { ok: true as const, restart: false };
    }
    const reflectionId = newId("ref");
    const masked = maskPii(answer);
    found.couple.reflections[reflectionId] = {
      id: reflectionId,
      sessionId: found.bundle.session.id,
      coupleId: found.couple.couple.id,
      rawNote: masked.masked,
      maskedNote: masked.masked,
      createdAt: realNowIso(),
    };
    found.bundle.session.status = "REFLECTED";
    if (answer !== "保存しない" && answer !== "分からない") {
      const cid = newId("mc");
      found.couple.memoryCandidates[cid] = {
        id: cid,
        coupleId: found.couple.couple.id,
        sessionId: found.bundle.session.id,
        reflectionId,
        answerId: questionId,
        subject: "PARTNER",
        type: "CARE",
        content: answer,
        sourceType: "PARTNER_STATEMENT_REPORTED",
        evidenceQuote: masked.masked,
        strength: "SOFT",
        scope: "NEXT_DATE",
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
        summary: `記憶候補: ${answer}`,
        diff: null,
        consumedAt: null,
        createdAt: realNowIso(),
      };
    }
    found.run.status = "SUCCEEDED";
    found.run.finishedAt = realNowIso();
    found.run.waitingQuestion = null;
    return { ok: true as const, restart: false };
  });
  if (result.ok && "restart" in result && result.restart) {
    const { dispatchProposal } = await import("@/server/workflows/dispatch");
    const { executeRun } = await import("@/server/agent/execute");
    void dispatchProposal(runId, "INITIAL_PLAN");
    if (getEnv().planOrchestrator !== "workflows") void executeRun(runId);
  }
  return result;
}

export async function decideApproval(uid: string, approvalId: string, decision: "APPROVE" | "REJECT") {
  return withApproval(approvalId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const approval = found.approval;
    if (approval.status !== "PENDING") return { ok: false as const, status: 409, error: "already consumed" };
    if (approval.kind === "PLAN_APPLY") {
      const bundle = found.couple.sessions[approval.sessionId];
      if (!bundle) return { ok: false as const, status: 404, error: "session" };
      if (bundle.session.currentPlanVersion !== approval.planVersionFrom) {
        return { ok: false as const, status: 409, error: "stale version" };
      }
      approval.status = decision === "APPROVE" ? "CONSUMED" : "REJECTED";
      approval.consumedAt = realNowIso();
      const run = bundle.runs[approval.runId];
      if (decision === "APPROVE") {
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
    }
    if (approval.kind === "MEMORY_SAVE" || approval.kind === "MEMORY_EDIT") {
      approval.status = decision === "APPROVE" ? "CONSUMED" : "REJECTED";
      approval.consumedAt = realNowIso();
      if (decision === "APPROVE") {
        const candidate = Object.values(found.couple.memoryCandidates).find(
          (c) => c.sessionId === approval.sessionId && approval.summary.includes(c.content),
        );
        if (candidate && candidate.answerId) {
          if (approval.kind === "MEMORY_EDIT") {
            const old = Object.values(found.couple.memories).find((m) => m.content !== candidate.content && m.active);
            if (old) old.active = false;
          }
          const mem = candidateToMemory({
            candidate,
            approvedAt: realNowIso(),
            targetSessionId: null,
            supersedes: approval.kind === "MEMORY_EDIT" ? approval.id : null,
          });
          found.couple.memories[mem.id] = mem;
        }
      }
      return { ok: true as const, approval };
    }
    return { ok: false as const, status: 400, error: "kind" };
  });
}

export async function updateProgress(
  uid: string,
  sessionId: string,
  body: {
    itemId?: string;
    progress?: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
    confirm?: boolean;
    location?: { lat: number; lng: number; label: string | null };
    scheduleNow?: string | null;
    status?: "CONFIRMED" | "IN_PROGRESS" | "DONE";
  },
) {
  return withSession(sessionId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    if (body.confirm || body.status === "CONFIRMED") {
      const version = found.bundle.session.currentPlanVersion;
      const plan = version ? found.bundle.planHistory[String(version)] : null;
      if (!plan) return { ok: false as const, status: 409, error: "確定できる行程がありません" };
      if (plan.validation.state === "FAIL") {
        return { ok: false as const, status: 409, error: "検証 FAIL の行程は確定できません" };
      }
      found.bundle.session.status = "CONFIRMED";
    }
    if (body.status) found.bundle.session.status = body.status;
    if (body.location) found.bundle.session.currentLocation = body.location;
    if (body.scheduleNow !== undefined) found.bundle.session.scheduleNow = body.scheduleNow;
    const version = found.bundle.session.currentPlanVersion;
    if (version && body.itemId && body.progress) {
      const plan = found.bundle.planHistory[String(version)];
      const item = plan.items.find((i) => i.id === body.itemId);
      if (item) item.progress = body.progress;
    }
    return { ok: true as const, session: found.bundle.session };
  });
}

export async function injectScenario(
  uid: string,
  sessionId: string,
  body: {
    kind: ScenarioKind;
    spotId?: string | null;
    legId?: string | null;
    from?: string | null;
    to?: string | null;
    overlay: Record<string, unknown>;
  },
) {
  if (!demoAllowed(uid)) return { ok: false as const, status: 403, error: "demo controls disabled" };
  const allowed: ScenarioKind[] = ["WEATHER", "SPOT_FULL", "TRAVEL_DELAY", "DEMO_CLOCK"];
  if (!allowed.includes(body.kind)) {
    return { ok: false as const, status: 400, error: "kind not on allow-list" };
  }
  return withSession(sessionId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const id = newId("scen");
    found.bundle.scenarios[id] = {
      id,
      sessionId,
      kind: body.kind,
      createdAt: realNowIso(),
      createdByUid: uid,
      target: {
        spotId: body.spotId ?? null,
        legId: body.legId ?? null,
        from: body.from ?? null,
        to: body.to ?? null,
      },
      overlay: body.overlay,
      baselineRef: "pre-overlay-preserved",
    };
    if (body.kind === "DEMO_CLOCK") {
      found.bundle.session.scheduleNow = String(body.overlay.now ?? realNowIso());
    }
    return { ok: true as const, scenarioId: id };
  });
}

export async function reviseMemory(uid: string, memoryId: string, content: string) {
  const masked = maskPii(content);
  return withMemory(memoryId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const cid = newId("mc");
    found.couple.memoryCandidates[cid] = {
      id: cid,
      coupleId: found.couple.couple.id,
      sessionId: found.memory.reflectionId,
      reflectionId: found.memory.reflectionId,
      answerId: found.memory.answerId,
      subject: found.memory.subject,
      type: found.memory.type,
      content: masked.masked,
      sourceType: found.memory.sourceType,
      evidenceQuote: found.memory.evidenceQuote,
      strength: found.memory.strength,
      scope: found.memory.scope,
      createdAt: realNowIso(),
    };
    const approvalId = newId("appr");
    found.couple.approvals[approvalId] = {
      id: approvalId,
      coupleId: found.couple.couple.id,
      sessionId: found.memory.reflectionId,
      runId: "revision",
      planVersionFrom: found.memory.version,
      planVersionTo: found.memory.version + 1,
      kind: "MEMORY_EDIT",
      status: "PENDING",
      summary: `記憶候補: ${masked.masked}`,
      diff: null,
      consumedAt: null,
      createdAt: realNowIso(),
    };
    return { ok: true as const, candidateId: cid, approvalId };
  });
}

export async function deactivateMemory(uid: string, memoryId: string) {
  return withMemory(memoryId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    found.memory.active = false;
    return { ok: true as const };
  });
}

export async function messageDraft(uid: string, sessionId: string) {
  return withSession(sessionId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const plan = found.bundle.session.currentPlanVersion
      ? found.bundle.planHistory[String(found.bundle.session.currentPlanVersion)]
      : null;
    if (!plan) return { ok: false as const, status: 400, error: "no plan" };
    const dto = {
      dateTokyo: found.bundle.session.input.dateTokyo,
      meetName: found.bundle.session.input.meet.name,
      endName: found.bundle.session.input.end.name,
      items: plan.items.map((it) => ({
        name: found.bundle.spots[it.spotId]?.name ?? it.spotId,
        startAt: it.startAt,
        endAt: it.endAt,
        officialUrl: found.bundle.spots[it.spotId]?.officialUrl ?? null,
      })),
    };
    const draft = draftShareMessage(dto);
    return { ok: true as const, dto, ...draft };
  });
}

export async function exportReplay(uid: string, runId: string) {
  return withRun(runId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    const id = newId("rep");
    const events = Object.values(found.bundle.events)
      .filter((e) => e.runId === runId)
      .sort((a, b) => a.seq - b.seq);
    const plan = found.run.resultPlanVersion
      ? found.bundle.planHistory[String(found.run.resultPlanVersion)]
      : null;
    found.couple.replays[id] = {
      id,
      coupleId: found.couple.couple.id,
      sessionId: found.bundle.session.id,
      runId,
      createdAt: realNowIso(),
      gitCommit: gitSha(),
      versions: found.run.versions,
      events,
      plan,
      spots: Object.values(found.bundle.spots),
      evidence: Object.values(found.bundle.evidence),
      costSnapshot: found.run.cost,
      notes: "デモ入力の記録。再生時に外部APIも新規課金もしない",
    };
    return { ok: true as const, replayId: id };
  });
}

export async function demoReset(uid: string, keepReplays = true) {
  if (!demoAllowed(uid)) return { ok: false as const, status: 403, error: "demo controls disabled" };
  await demoResetStore(uid, keepReplays);
  return { ok: true as const };
}

export async function listMemory(uid: string, coupleId: string) {
  const couple = await loadCouple(coupleId);
  if (!couple) return { ok: false as const, status: 404, error: "not found" };
  if (couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
  return {
    ok: true as const,
    ...presentMemoryList({
      ok: true,
      memories: Object.values(couple.memories),
      candidates: Object.values(couple.memoryCandidates),
    }),
  };
}

export async function getReplay(uid: string, replayId: string) {
  const found = await getReplayFromStore(uid, replayId);
  if (!found) return { ok: false as const, status: 404 as const, error: "not found" };
  return {
    ok: true as const,
    ...presentReplay({ ok: true, replay: found.replay }),
  };
}

export async function selectSessionEvents(uid: string, sessionId: string, eventIds: string[]) {
  return withSession(sessionId, (found) => {
    if (!found) return { ok: false as const, status: 404, error: "not found" };
    if (found.couple.couple.ownerUid !== uid) return { ok: false as const, status: 403, error: "forbidden" };
    found.bundle.session.input = {
      ...found.bundle.session.input,
      selectedEventIds: [...new Set(eventIds)],
      eventFallbackAcknowledged: false,
    };
    return {
      ok: true as const,
      sessionId,
      selectedEventIds: found.bundle.session.input.selectedEventIds,
    };
  });
}

export async function ownerCoupleId(uid: string): Promise<string | null> {
  return ownerCoupleIdFromStore(uid);
}

export { sha256, tokyoDateTime };
