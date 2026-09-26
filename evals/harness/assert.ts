import type { EvalExpected } from "./schema";
import type { EvalMetrics, ObservedOutcome } from "./metrics";

export type AssertResult = {
  pass: boolean;
  failures: string[];
};

export function assertExpected(
  expected: EvalExpected,
  observed: ObservedOutcome,
  metrics: EvalMetrics,
): AssertResult {
  const failures: string[] = [];

  if (observed.outcome !== expected.outcome) {
    failures.push(`outcome: expected ${expected.outcome}, got ${observed.outcome}`);
  }

  const allowedQuestions = [
    ...(expected.questionId ? [expected.questionId] : []),
    ...(expected.questionIds ?? []),
  ];
  if (allowedQuestions.length && expected.outcome === "WAITING_INPUT") {
    if (!observed.questionId || !allowedQuestions.includes(observed.questionId)) {
      failures.push(
        `questionId: expected one of [${allowedQuestions.join(", ")}], got ${observed.questionId ?? "null"}`,
      );
    }
  }

  if (expected.forbidIssueCodes?.length) {
    const hit = observed.issueCodes.filter((code) => expected.forbidIssueCodes!.includes(code));
    if (hit.length) {
      failures.push(`forbidIssueCodes present: ${hit.join(", ")}`);
    }
  }

  if (expected.requireIssueCodes?.length) {
    const missing = expected.requireIssueCodes.filter((code) => !observed.issueCodes.includes(code));
    if (missing.length) {
      failures.push(`requireIssueCodes missing: ${missing.join(", ")}`);
    }
  }

  if (
    expected.validationStates?.length &&
    observed.outcome === "PLAN" &&
    observed.validationState &&
    !expected.validationStates.includes(
      observed.validationState as "PASS" | "CONDITIONAL" | "FAIL",
    )
  ) {
    failures.push(
      `validationState: expected one of [${expected.validationStates.join(", ")}], got ${observed.validationState}`,
    );
  }

  if (expected.maxApiCalls != null && metrics.api_calls > expected.maxApiCalls) {
    failures.push(`maxApiCalls: ${metrics.api_calls} > ${expected.maxApiCalls}`);
  }

  if (expected.maxLatencyMs != null && metrics.latency_ms > expected.maxLatencyMs) {
    failures.push(`maxLatencyMs: ${metrics.latency_ms} > ${expected.maxLatencyMs}`);
  }

  return { pass: failures.length === 0, failures };
}
