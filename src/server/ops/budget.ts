import { getEnv } from "@/config/env";
import type { ApiBudgetKind } from "@/config/settings";
import { tokyoToday } from "@/lib/time";
import { tryIncrementCounter } from "./counters";
import { budgetExceededError, type OpsGuardError } from "./errors";
import { emitBudgetExceeded } from "./metrics";

export type { ApiBudgetKind };

export function budgetCounterKey(kind: ApiBudgetKind, now: Date = new Date()): string {
  return `budget:${kind}:${tokyoToday(now)}`;
}

/**
 * Reserve one call against the Tokyo-day API budget for `kind`.
 * Over budget → explicit error (callers must not fall back to MOCK).
 */
export async function consumeApiBudget(
  kind: ApiBudgetKind,
  now: Date = new Date(),
): Promise<{ ok: true; value: number } | { ok: false; error: OpsGuardError }> {
  const limit = getEnv().apiBudgets[kind];
  const key = budgetCounterKey(kind, now);
  const result = await tryIncrementCounter(key, limit);
  if (!result.ok) {
    emitBudgetExceeded({ kind });
    return { ok: false, error: budgetExceededError(kind) };
  }
  return { ok: true, value: result.value };
}
