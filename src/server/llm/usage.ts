import { getEnv } from "@/config/env";
import { FX } from "@/config/settings";

export type LlmUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  costJpy: number | null;
};

export function usdToJpy(usd: number | null): number | null {
  if (usd == null) return null;
  if (usd === 0) return 0;
  return usd * FX.usdJpy;
}

export function usageFromOrca(json: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost_usd?: number;
  };
}): LlmUsage {
  const costUsd = json.usage?.cost_usd ?? null;
  return {
    promptTokens: json.usage?.prompt_tokens ?? null,
    completionTokens: json.usage?.completion_tokens ?? null,
    costUsd,
    costJpy: usdToJpy(costUsd),
  };
}

export function usageFromNative(json: Record<string, unknown>): LlmUsage {
  const meta =
    json.usageMetadata && typeof json.usageMetadata === "object"
      ? (json.usageMetadata as Record<string, unknown>)
      : null;
  const usage =
    json.usage && typeof json.usage === "object" ? (json.usage as Record<string, unknown>) : null;
  const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
  const costUsd =
    num(meta?.costUsd) ?? num(meta?.cost_usd) ?? num(usage?.cost_usd) ?? num(usage?.costUsd);
  return {
    promptTokens: num(meta?.promptTokenCount) ?? num(usage?.prompt_tokens),
    completionTokens: num(meta?.candidatesTokenCount) ?? num(usage?.completion_tokens),
    costUsd,
    costJpy: usdToJpy(costUsd),
  };
}

export function orcaBase(): string {
  return getEnv().orcaBaseUrl.replace(/\/$/, "");
}

export function orcaHeaders(): HeadersInit {
  const env = getEnv();
  return {
    Authorization: `Bearer ${env.orcaApiKey}`,
    "Content-Type": "application/json",
    "X-OrcaRouter-Include-Cost": "true",
  };
}

export async function lookupSettledCost(requestId: string | null): Promise<number | null> {
  if (!requestId) return null;
  const res = await fetch(`${orcaBase()}/generation?id=${encodeURIComponent(requestId)}`, {
    headers: orcaHeaders(),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json()) as { data?: { total_cost?: number } };
  return typeof json.data?.total_cost === "number" ? json.data.total_cost : null;
}

export function requestIdFromHeaders(headers: Headers): string | null {
  return headers.get("X-Orca-Request-Id") ?? headers.get("x-orca-request-id");
}
