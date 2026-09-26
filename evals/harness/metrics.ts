import type { OrchestratedPlan } from "@/server/agent/orchestrate";
import type { ValidationIssue, ValidationResult } from "@/domain/schemas";
import { hasConstraintViolation } from "@/domain/plan/validatePlan";
import type { EvalExpected, EvalOutcome } from "./schema";

export type EvalMetrics = {
  plan_success: boolean;
  constraint_violation: boolean;
  unnecessary_confirmation: boolean;
  api_calls: number;
  api_calls_by_provider: Record<string, number>;
  latency_ms: number;
  cost: {
    llmJpy: number | null;
    llmUsd: number | null;
    apiJpy: number | null;
  };
};

export type ObservedPlanItem = {
  spotId: string;
  locked: boolean;
  startAt: string;
  endAt: string;
  /** Spot environment when known. */
  environment: "INDOOR" | "OUTDOOR" | "MIXED" | null;
  /** From input.fixedAppointments when spotId matched. */
  appointmentLabel: string | null;
};

export type ObservedOutcome = {
  outcome: EvalOutcome;
  questionId: string | null;
  issueCodes: string[];
  validationState: string | null;
  spotIds: string[];
  firstSpotId: string | null;
  /** INITIAL first spot when this run was a REPLAN; otherwise null. */
  baseFirstSpotId: string | null;
  assumptions: string[];
  items: ObservedPlanItem[];
  /** True when any leg durationMinutes.value is null. */
  hasNullTravelDuration: boolean;
  /** Count of plan.diff.timeShifts after REPLAN (0 when not replan / no base). */
  timeShiftCount: number;
  /** reflect_analyze action when that path ran. */
  reflectAction: string | null;
  memoryInfluenceEffects: Array<"PRIORITY" | "DURATION" | "REST_INSERT" | "NONE">;
  memoryInfluenceIds: string[];
};

export function observeOutcome(
  result: OrchestratedPlan | null,
  failed: boolean,
  opts?: {
    baseFirstSpotId?: string | null;
    fixedAppointments?: Array<{ label: string; spotId: string | null }>;
    timeShiftCount?: number;
    reflectAction?: string | null;
  },
): ObservedOutcome {
  const empty: ObservedOutcome = {
    outcome: "FAILED",
    questionId: null,
    issueCodes: [],
    validationState: null,
    spotIds: [],
    firstSpotId: null,
    baseFirstSpotId: opts?.baseFirstSpotId ?? null,
    assumptions: [],
    items: [],
    hasNullTravelDuration: false,
    timeShiftCount: opts?.timeShiftCount ?? 0,
    reflectAction: opts?.reflectAction ?? null,
    memoryInfluenceEffects: [],
    memoryInfluenceIds: [],
  };

  if (failed || !result) {
    return empty;
  }

  const plan = result.built?.plan ?? null;
  const spots = result.built?.spots ?? {};
  const issues: ValidationIssue[] = plan?.validation.issues ?? [];
  const issueCodes = issues.map((issue) => issue.code);
  const labelBySpot = new Map(
    (opts?.fixedAppointments ?? [])
      .filter((a) => a.spotId)
      .map((a) => [a.spotId as string, a.label] as const),
  );
  const items: ObservedPlanItem[] = (plan?.items ?? []).map((item) => ({
    spotId: item.spotId,
    locked: item.locked,
    startAt: item.startAt,
    endAt: item.endAt,
    environment: spots[item.spotId]?.environment.value ?? null,
    appointmentLabel: labelBySpot.get(item.spotId) ?? null,
  }));
  const spotIds = items.map((i) => i.spotId);
  const assumptions = plan?.assumptions ?? [];
  const hasNullTravelDuration = (plan?.legs ?? []).some((leg) => leg.durationMinutes.value == null);
  const memoryInfluences = plan?.memoryInfluences ?? [];
  const memoryInfluenceEffects = memoryInfluences.map((row) => row.effect);
  const memoryInfluenceIds = [...new Set(memoryInfluences.map((row) => row.memoryId))];

  const base = {
    issueCodes,
    validationState: plan?.validation.state ?? null,
    spotIds,
    firstSpotId: spotIds[0] ?? null,
    baseFirstSpotId: opts?.baseFirstSpotId ?? null,
    assumptions,
    items,
    hasNullTravelDuration,
    timeShiftCount: opts?.timeShiftCount ?? 0,
    reflectAction: opts?.reflectAction ?? null,
    memoryInfluenceEffects,
    memoryInfluenceIds,
  };

  if (result.waitingQuestion) {
    return {
      outcome: "WAITING_INPUT",
      questionId: result.waitingQuestion.id,
      ...base,
    };
  }
  if (result.built) {
    return {
      outcome: "PLAN",
      questionId: null,
      ...base,
    };
  }
  return {
    ...empty,
    issueCodes,
    validationState: plan?.validation.state ?? null,
    spotIds,
    firstSpotId: spotIds[0] ?? null,
    assumptions,
    items,
    hasNullTravelDuration,
    timeShiftCount: opts?.timeShiftCount ?? 0,
    reflectAction: opts?.reflectAction ?? null,
    memoryInfluenceEffects,
    memoryInfluenceIds,
  };
}

export function computeMetrics(args: {
  observed: ObservedOutcome;
  expected: EvalExpected;
  apiCallsByProvider: Record<string, number>;
  latencyMs: number;
  cost: EvalMetrics["cost"];
  /** Prefer passing full validatePlan result (severity is source of truth). */
  validation?: ValidationResult | null;
}): EvalMetrics {
  const api_calls = Object.values(args.apiCallsByProvider).reduce((n, v) => n + v, 0);
  const plan_success = args.observed.outcome === "PLAN";

  const constraint_violation = args.validation
    ? hasConstraintViolation(args.validation)
    : args.observed.validationState === "FAIL" ||
      args.observed.validationState === "CONDITIONAL";

  const unnecessary_confirmation =
    args.expected.outcome === "PLAN" && args.observed.outcome === "WAITING_INPUT";

  return {
    plan_success,
    constraint_violation,
    unnecessary_confirmation,
    api_calls,
    api_calls_by_provider: { ...args.apiCallsByProvider },
    latency_ms: args.latencyMs,
    cost: args.cost,
  };
}
