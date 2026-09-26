import {
  MODEL_SETTINGS_VERSION,
  PROMPT_VERSION,
  SCHEMA_VERSION,
  TOOL_VERSION,
} from "@/config/settings";
import type { Memory, Plan, PlanningInput, Run, ScenarioOverlay, Session, Spot } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import {
  emptyCoupleBundle,
  emptySessionBundle,
  type CoupleBundle,
} from "@/server/repositories/types";
import { loadCouple, putCouple } from "@/server/repositories/store";
import type { EvalOverlaySpec, EvalSeedMemory } from "./schema";

export type SeededWorld = {
  coupleId: string;
  sessionId: string;
  runId: string;
  couple: CoupleBundle;
  session: Session;
  run: Run;
  overlays: ScenarioOverlay[];
  /** Approved memories for orchestratePlanning (filtered for session binding). */
  memories: Memory[];
};

const TOKYO_MEET = {
  name: "東京駅",
  lat: 35.6812,
  lng: 139.7671,
  spotId: "mock:tokyo-station",
} as const;

export function defaultPlanningInput(over: Partial<PlanningInput> = {}): PlanningInput {
  return {
    dateTokyo: "2026-09-22",
    startTime: "11:00",
    endTime: "18:00",
    meet: { ...TOKYO_MEET },
    end: { ...TOKYO_MEET },
    travelMode: "WALK",
    budget: { mealsJpy: 5000, facilitiesJpy: 2000, transitJpy: 1000 },
    preferences: [
      {
        id: "p1",
        subject: "BOTH",
        content: "カフェ",
        priority: "PREFER",
        source: "SELF_REPORT",
      },
    ],
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    areaName: "東京駅",
    areaLat: 35.6812,
    areaLng: 139.7671,
    radiusMeters: 2500,
    ...over,
  };
}

function buildOverlays(
  sessionId: string,
  specs: EvalOverlaySpec[] | undefined,
  uid: string,
): ScenarioOverlay[] {
  if (!specs?.length) return [];
  const now = realNowIso();
  return specs.map((spec, index) => ({
    id: `ov_${sessionId}_${index}`,
    sessionId,
    kind: spec.kind,
    createdAt: now,
    createdByUid: uid,
    target: {
      spotId: spec.target?.spotId ?? null,
      legId: spec.target?.legId ?? null,
      from: spec.target?.from ?? null,
      to: spec.target?.to ?? null,
    },
    overlay: spec.overlay ?? {},
    baselineRef: null,
  }));
}

function makeRun(args: {
  runId: string;
  coupleId: string;
  sessionId: string;
  uid: string;
  kind: Run["kind"];
  overlays: ScenarioOverlay[];
  instruction?: string | null;
  targetPlanItemId?: string | null;
  basePlanVersion?: number | null;
}): Run {
  const now = realNowIso();
  return {
    id: args.runId,
    coupleId: args.coupleId,
    sessionId: args.sessionId,
    ownerUid: args.uid,
    kind: args.kind,
    status: "PENDING",
    mode: args.overlays.length ? "LIVE_SCENARIO" : "LIVE",
    displayRuntime: "MOCK",
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    trigger: "eval",
    instruction: args.instruction ?? null,
    targetPlanItemId: args.targetPlanItemId ?? null,
    basePlanVersion: args.basePlanVersion ?? null,
    resultPlanVersion: null,
    waitingQuestion: null,
    waitingApprovalId: null,
    reflectionId: null,
    reflectionContentVersion: null,
    error: null,
    cancelReason: null,
    cost: {
      llmUsd: 0,
      llmJpy: 0,
      apiJpy: 0,
      mundaneCalls: 0,
      hardCalls: 0,
      unaccountedCalls: 0,
    },
    versions: {
      schema: SCHEMA_VERSION,
      prompt: PROMPT_VERSION,
      tool: TOOL_VERSION,
      modelSettings: MODEL_SETTINGS_VERSION,
      git: null,
    },
  };
}

function buildSeedMemories(
  specs: EvalSeedMemory[] | undefined,
  coupleId: string,
  sessionId: string,
): Memory[] {
  if (!specs?.length) return [];
  const now = realNowIso();
  return specs.map((spec) => {
    const bind =
      spec.bindToSession ?? (spec.scope === "NEXT_DATE");
    return {
      id: spec.id,
      coupleId,
      subject: "BOTH" as const,
      type: spec.type,
      content: spec.content,
      sourceType: "SELF_REPORT" as const,
      reflectionId: "ref_eval",
      reflectionVersion: 1,
      answerId: "ans_eval",
      evidenceQuote: spec.content,
      confirmation: "USER_CONFIRMED" as const,
      approvedAt: now,
      visibility: "PRIVATE" as const,
      strength: spec.strength,
      scope: spec.scope,
      targetSessionId: bind ? sessionId : null,
      planDirectives: spec.planDirectives,
      active: true,
      version: 1,
      supersedes: null,
    };
  });
}

export async function seedPlanningWorld(args: {
  input: PlanningInput;
  overlaySpecs?: EvalOverlaySpec[];
  seedMemories?: EvalSeedMemory[];
  runKind?: Run["kind"];
  instruction?: string | null;
  targetPlanItemId?: string | null;
  basePlanVersion?: number | null;
}): Promise<SeededWorld> {
  const uid = "uid_eval";
  const coupleId = newId("cpl");
  const sessionId = newId("ses");
  const runId = newId("run");
  const now = realNowIso();
  const overlays = buildOverlays(sessionId, args.overlaySpecs, uid);
  const memories = buildSeedMemories(args.seedMemories, coupleId, sessionId);

  const session: Session = {
    id: sessionId,
    coupleId,
    ownerUid: uid,
    status: "DRAFT",
    input: args.input,
    currentPlanVersion: null,
    currentLocation: null,
    scheduleNow: null,
    isDemo: true,
    createdAt: now,
    walkLongAck: null,
    pendingWalkAckFingerprint: null,
  };

  const run = makeRun({
    runId,
    coupleId,
    sessionId,
    uid,
    kind: args.runKind ?? "INITIAL_PLAN",
    overlays,
    instruction: args.instruction,
    targetPlanItemId: args.targetPlanItemId,
    basePlanVersion: args.basePlanVersion,
  });

  const couple = emptyCoupleBundle({
    id: coupleId,
    ownerUid: uid,
    isDemo: true,
    createdAt: now,
  });
  for (const memory of memories) {
    couple.memories[memory.id] = memory;
  }
  const sessionBundle = emptySessionBundle(session);
  sessionBundle.runs[runId] = run;
  for (const overlay of overlays) {
    sessionBundle.scenarios[overlay.id] = overlay;
  }
  couple.sessions[sessionId] = sessionBundle;

  await putCouple(couple);
  const reloaded = await loadCouple(coupleId);
  if (!reloaded) throw new Error(`failed to seed couple ${coupleId}`);

  return {
    coupleId,
    sessionId,
    runId,
    couple: reloaded,
    session,
    run,
    overlays,
    memories,
  };
}

/** Persist an INITIAL plan, then attach a PENDING REPLAN run on the same session. */
export async function seedReplanWorld(args: {
  world: SeededWorld;
  plan: Plan;
  spots: Record<string, Spot>;
  instruction: string;
  targetPlanItemId: string | null;
}): Promise<SeededWorld> {
  const couple = await loadCouple(args.world.coupleId);
  if (!couple) throw new Error("couple missing for replan seed");
  const bundle = couple.sessions[args.world.sessionId];
  if (!bundle) throw new Error("session missing for replan seed");

  bundle.planHistory[String(args.plan.version)] = args.plan;
  bundle.session.currentPlanVersion = args.plan.version;
  for (const [id, spot] of Object.entries(args.spots)) {
    bundle.spots[id] = spot;
  }

  const runId = newId("run");
  const run = makeRun({
    runId,
    coupleId: args.world.coupleId,
    sessionId: args.world.sessionId,
    uid: bundle.session.ownerUid,
    kind: "REPLAN",
    overlays: args.world.overlays,
    instruction: args.instruction,
    targetPlanItemId: args.targetPlanItemId,
    basePlanVersion: args.plan.version,
  });
  bundle.runs[runId] = run;
  await putCouple(couple);

  const reloaded = await loadCouple(args.world.coupleId);
  if (!reloaded) throw new Error("failed to reload couple after replan seed");
  const session = reloaded.sessions[args.world.sessionId]?.session;
  if (!session) throw new Error("session missing after replan seed");

  return {
    coupleId: args.world.coupleId,
    sessionId: args.world.sessionId,
    runId,
    couple: reloaded,
    session,
    run,
    overlays: args.world.overlays,
    memories: args.world.memories,
  };
}
