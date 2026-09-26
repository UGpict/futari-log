import type { OrchestratedPlan } from "@/server/agent/orchestrate";
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

export type ObservedOutcome = {
  outcome: EvalOutcome;
  questionId: string | null;
  issueCodes: string[];
  validationState: string | null;
};

export function observeOutcome(result: OrchestratedPlan | null, failed: boolean): ObservedOutcome {
  if (failed || !result) {
    return {
      outcome: "FAILED",
      questionId: null,
      issueCodes: [],
      validationState: null,
    };
  }
  const issues = result.built?.plan.validation.issues ?? [];
  const issueCodes = issues.map((issue) => issue.code);
  if (result.waitingQuestion) {
    return {
      outcome: "WAITING_INPUT",
      questionId: result.waitingQuestion.id,
      issueCodes,
      validationState: result.built?.plan.validation.state ?? null,
    };
  }
  if (result.built) {
    return {
      outcome: "PLAN",
      questionId: null,
      issueCodes,
      validationState: result.built.plan.validation.state,
    };
  }
  return {
    outcome: "FAILED",
    questionId: null,
    issueCodes,
    validationState: null,
  };
}

export function computeMetrics(args: {
  observed: ObservedOutcome;
  expected: EvalExpected;
  apiCallsByProvider: Record<string, number>;
  latencyMs: number;
  cost: EvalMetrics["cost"];
}): EvalMetrics {
  const api_calls = Object.values(args.apiCallsByProvider).reduce((n, v) => n + v, 0);
  const plan_success = args.observed.outcome === "PLAN";
  const constraint_violation =
    args.observed.issueCodes.some((code) =>
      ["TRAVEL_UNKNOWN", "END_TRAVEL_UNKNOWN", "CLOSED", "MUST_UNMET"].includes(code),
    ) ||
    (args.observed.validationState === "FAIL" && args.observed.outcome === "PLAN");
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
