import type { EvalExpected } from "./schema";
import type { EvalMetrics, ObservedOutcome } from "./metrics";

export type AssertResult = {
  pass: boolean;
  failures: string[];
};

/** True when text claims haversine / straight-line distance was used as travel fill. */
export function claimsHaversineFill(text: string): boolean {
  // Explicit product messaging that haversine was *not* used.
  if (/直線距離では代用し(てい)?ない|直線距離で(は)?埋めない|直線距離では代用しない/.test(text)) {
    return false;
  }
  return /haversine|直線距離(で|を|代用)|直線で代用/.test(text);
}

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

  if (expected.forbidSpotIds?.length) {
    const hit = observed.spotIds.filter((id) => expected.forbidSpotIds!.includes(id));
    if (hit.length) {
      failures.push(`forbidSpotIds present: ${hit.join(", ")}`);
    }
  }

  if (expected.requireSpotIds?.length) {
    const missing = expected.requireSpotIds.filter((id) => !observed.spotIds.includes(id));
    if (missing.length) {
      failures.push(`requireSpotIds missing: ${missing.join(", ")}`);
    }
  }

  if (expected.replanChangedFirstSpot) {
    if (!observed.baseFirstSpotId) {
      failures.push("replanChangedFirstSpot: missing baseFirstSpotId from INITIAL plan");
    } else if (!observed.firstSpotId) {
      failures.push("replanChangedFirstSpot: final plan has no first spot");
    } else if (observed.firstSpotId === observed.baseFirstSpotId) {
      failures.push(
        `replanChangedFirstSpot: first spot unchanged (${observed.firstSpotId})`,
      );
    }
  }

  if (expected.requireFixedAppointment) {
    const want = expected.requireFixedAppointment;
    const locked = observed.items.filter((i) => i.locked);
    if (!locked.length) {
      failures.push("requireFixedAppointment: no locked plan items");
    } else {
      const ok = locked.some((item) => {
        if (want.spotId && item.spotId !== want.spotId) return false;
        if (want.label && item.appointmentLabel !== want.label) return false;
        if (want.startAtContains && !item.startAt.includes(want.startAtContains)) return false;
        return true;
      });
      if (!ok) {
        failures.push(
          `requireFixedAppointment: no locked item matching ${JSON.stringify(want)}; locked=${locked
            .map((i) => `${i.spotId}@${i.startAt}${i.appointmentLabel ? `(${i.appointmentLabel})` : ""}`)
            .join(", ")}`,
        );
      }
    }
  }

  if (expected.forbidOutdoor) {
    const outdoor = observed.items.filter((i) => i.environment === "OUTDOOR");
    if (outdoor.length) {
      failures.push(
        `forbidOutdoor: outdoor spots in plan: ${outdoor.map((i) => i.spotId).join(", ")}`,
      );
    }
  }

  if (expected.forbidHaversineAssumption) {
    const badAssumptions = observed.assumptions.filter(claimsHaversineFill);
    if (badAssumptions.length) {
      failures.push(`forbidHaversineAssumption: ${badAssumptions.join(" | ")}`);
    }
  }

  return { pass: failures.length === 0, failures };
}
