import { LIMITS } from "@/config/settings";
import { tokyoToday } from "@/lib/time";
import { sha256 } from "@/lib/ids";
import { insertPendingRun } from "@/server/repositories/store";
import { kickRun } from "@/server/workflows/dispatch";
import {
  getDailyPriceEnrichBudget,
  tryConsumeDailyPriceEnrichSlot,
} from "./priceRepo";

export function priceEnrichTrigger(placeId: string): string {
  return `price_enrich:${placeId}`;
}

export function placeIdFromPriceEnrichTrigger(trigger: string | null | undefined): string | null {
  if (!trigger?.startsWith("price_enrich:")) return null;
  return trigger.slice("price_enrich:".length) || null;
}

/**
 * Enqueue PRICE_ENRICH via insertPendingRun → kickRun (same path as REFLECTION).
 * Never awaits the enrich work — plan path stays free of LLM wait.
 */
export async function enqueuePriceEnrichRun(input: {
  uid: string;
  sessionId: string;
  placeId: string;
  venueName: string;
  websiteUri?: string | null;
  address?: string | null;
}): Promise<{ enqueued: boolean; reason: string; runId?: string }> {
  const day = tokyoToday();
  const budget = await getDailyPriceEnrichBudget(day);
  if (budget.runs >= LIMITS.maxPriceEnrichRunsPerDay) {
    return { enqueued: false, reason: `daily_run_cap:${LIMITS.maxPriceEnrichRunsPerDay}` };
  }
  if (budget.costUsd >= LIMITS.maxPriceEnrichCostUsdPerDay) {
    return { enqueued: false, reason: `daily_cost_cap_usd:${LIMITS.maxPriceEnrichCostUsdPerDay}` };
  }
  const reserved = await tryConsumeDailyPriceEnrichSlot(day);
  if (!reserved.ok) {
    return { enqueued: false, reason: reserved.reason };
  }

  const body = {
    placeId: input.placeId,
    venueName: input.venueName,
    websiteUri: input.websiteUri ?? null,
    address: input.address ?? null,
  };
  const run = await insertPendingRun({
    uid: input.uid,
    sessionId: input.sessionId,
    kind: "PRICE_ENRICH",
    trigger: priceEnrichTrigger(input.placeId),
    instruction: JSON.stringify(body),
    idempotencyKey: `price_enrich:${day}:${input.placeId}`,
    bodyHash: sha256(JSON.stringify(body)),
  });
  if (!run.ok) {
    return { enqueued: false, reason: run.error };
  }
  if (!run.duplicated) {
    kickRun(run.runId, "PRICE_ENRICH");
  } else {
    // Duplicated PENDING still kick like REFLECTION.
    kickRun(run.runId, "PRICE_ENRICH");
  }
  return { enqueued: true, reason: run.duplicated ? "duplicated" : "queued", runId: run.runId };
}
