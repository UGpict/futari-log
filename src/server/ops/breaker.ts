/**
 * Phase 2b: process-local circuit breaker for external providers.
 *
 * Targets: places (Nearby/Text), routes (computeRoutes), orcarouter.
 * Multi-instance shared state (Firestore/Redis) is a follow-up — see docs/ops/monitoring.md.
 *
 * HALF_OPEN allows **one in-flight probe** at a time. Concurrent callers get CIRCUIT_OPEN
 * until the probe settles (success/failure/ignore/release).
 */

import { CIRCUIT_BREAKER, type BreakerProvider } from "@/config/settings";
import { circuitOpenError, isOpsGuardError } from "./errors";
import { emitBreakerState } from "./metrics";

export type { BreakerProvider };
export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

type BreakerSnapshot = {
  state: BreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  openedAtMs: number | null;
  lastTransitionAtMs: number;
  /** True while a HALF_OPEN probe is in flight (single-probe gate). */
  halfOpenProbeInFlight: boolean;
};

type Clock = () => number;

const breakers = new Map<BreakerProvider, BreakerSnapshot>();
let clock: Clock = () => Date.now();

function fresh(): BreakerSnapshot {
  return {
    state: "CLOSED",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    openedAtMs: null,
    lastTransitionAtMs: clock(),
    halfOpenProbeInFlight: false,
  };
}

function getOrCreate(provider: BreakerProvider): BreakerSnapshot {
  let snap = breakers.get(provider);
  if (!snap) {
    snap = fresh();
    breakers.set(provider, snap);
  }
  return snap;
}

function transition(provider: BreakerProvider, snap: BreakerSnapshot, next: BreakerState) {
  if (snap.state === next) return;
  snap.state = next;
  snap.lastTransitionAtMs = clock();
  if (next === "OPEN") {
    snap.openedAtMs = snap.lastTransitionAtMs;
    snap.consecutiveSuccesses = 0;
    snap.halfOpenProbeInFlight = false;
  }
  if (next === "CLOSED") {
    snap.openedAtMs = null;
    snap.consecutiveFailures = 0;
    snap.consecutiveSuccesses = 0;
    snap.halfOpenProbeInFlight = false;
  }
  if (next === "HALF_OPEN") {
    snap.consecutiveSuccesses = 0;
    snap.consecutiveFailures = 0;
    // probe lease is acquired by assertBreakerAllows, not here
  }
  emitBreakerState({ provider, state: next });
}

function releaseHalfOpenProbe(provider: BreakerProvider) {
  const snap = getOrCreate(provider);
  if (snap.state === "HALF_OPEN") {
    snap.halfOpenProbeInFlight = false;
  }
}

/** Test/helpers: force clock (ms). */
export function setBreakerClockForTests(next: Clock | null) {
  clock = next ?? (() => Date.now());
}

export function resetBreakersForTests() {
  breakers.clear();
  clock = () => Date.now();
}

export function getBreakerState(provider: BreakerProvider): BreakerSnapshot {
  const snap = { ...getOrCreate(provider) };
  return snap;
}

/**
 * Allow a call, or throw CIRCUIT_OPEN.
 * OPEN → HALF_OPEN after openMs; only one HALF_OPEN probe may run at a time.
 */
export function assertBreakerAllows(provider: BreakerProvider): void {
  const snap = getOrCreate(provider);
  const now = clock();
  if (snap.state === "OPEN") {
    const openedAt = snap.openedAtMs ?? snap.lastTransitionAtMs;
    if (now - openedAt >= CIRCUIT_BREAKER.openMs) {
      transition(provider, snap, "HALF_OPEN");
      snap.halfOpenProbeInFlight = true;
      return;
    }
    throw circuitOpenError(provider);
  }
  if (snap.state === "HALF_OPEN") {
    if (snap.halfOpenProbeInFlight) {
      throw circuitOpenError(provider);
    }
    snap.halfOpenProbeInFlight = true;
  }
}

export function recordBreakerSuccess(provider: BreakerProvider): void {
  const snap = getOrCreate(provider);
  if (snap.state === "HALF_OPEN") {
    snap.halfOpenProbeInFlight = false;
    snap.consecutiveSuccesses += 1;
    snap.consecutiveFailures = 0;
    if (snap.consecutiveSuccesses >= CIRCUIT_BREAKER.successThreshold) {
      transition(provider, snap, "CLOSED");
    }
    return;
  }
  if (snap.state === "CLOSED") {
    snap.consecutiveFailures = 0;
  }
}

export function recordBreakerFailure(provider: BreakerProvider): void {
  const snap = getOrCreate(provider);
  if (snap.state === "HALF_OPEN") {
    snap.halfOpenProbeInFlight = false;
    transition(provider, snap, "OPEN");
    return;
  }
  if (snap.state === "CLOSED") {
    snap.consecutiveFailures += 1;
    snap.consecutiveSuccesses = 0;
    if (snap.consecutiveFailures >= CIRCUIT_BREAKER.failureThreshold) {
      transition(provider, snap, "OPEN");
    }
  }
}

export type BreakerClassify = "success" | "failure" | "ignore";

/**
 * Run `fn` under the breaker. Throws OpsGuardError CIRCUIT_OPEN when OPEN / non-probe HALF_OPEN.
 * OpsGuardError from fn (budget / nested open) is rethrown; probe lease is released.
 */
export async function runWithBreaker<T>(
  provider: BreakerProvider,
  fn: () => Promise<T>,
  opts?: { classify?: (result: T) => BreakerClassify },
): Promise<T> {
  assertBreakerAllows(provider);
  let settled = false;
  try {
    const result = await fn();
    const verdict = opts?.classify?.(result) ?? "success";
    if (verdict === "success") {
      recordBreakerSuccess(provider);
    } else if (verdict === "failure") {
      recordBreakerFailure(provider);
    } else {
      releaseHalfOpenProbe(provider);
    }
    settled = true;
    return result;
  } catch (error) {
    if (isOpsGuardError(error)) throw error;
    recordBreakerFailure(provider);
    settled = true;
    throw error;
  } finally {
    if (!settled) releaseHalfOpenProbe(provider);
  }
}
