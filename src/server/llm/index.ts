import { getEnv } from "@/config/env";
import { FX, LLM_PRICE_TABLE, MODEL_PARAMS } from "@/config/settings";
import { z, type ZodType } from "zod";

export type Pool = "mundane" | "hard";
export type LlmTask =
  | "structure"
  | "candidates"
  | "reflect"
  | "share"
  | "final_plan"
  | "replan"
  | "conflict";

export const TASK_POOL: Record<LlmTask, Pool> = {
  structure: "mundane",
  candidates: "mundane",
  reflect: "mundane",
  share: "mundane",
  final_plan: "hard",
  replan: "hard",
  conflict: "hard",
};

export type LlmCallResult<T> = {
  data: T | null;
  ok: boolean;
  requestedModel: string;
  actualModel: string;
  pool: Pool;
  promptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  costJpy: number | null;
  latencyMs: number;
  repaired: boolean;
  error: string | null;
};

function modelFor(pool: Pool): string {
  const env = getEnv();
  return pool === "hard" ? env.orcaHardModel : env.orcaMundaneModel;
}

function usdToJpy(usd: number | null): number | null {
  if (usd == null) return null;
  return Math.round(usd * FX.usdJpy);
}

export async function callLLM<T>(input: {
  task: LlmTask;
  messages: { role: "system" | "user"; content: string }[];
  schema: ZodType<T>;
  runId: string;
  signal?: AbortSignal;
  mockValue: T;
}): Promise<LlmCallResult<T>> {
  const pool = TASK_POOL[input.task];
  const requestedModel = modelFor(pool);
  const started = Date.now();
  const env = getEnv();

  if (env.runtime !== "LIVE" || !env.orcaApiKey) {
    const parsed = input.schema.safeParse(input.mockValue);
    return {
      data: parsed.success ? parsed.data : null,
      ok: parsed.success,
      requestedModel,
      actualModel: "mock/planner-v0.5",
      pool,
      promptTokens: 0,
      completionTokens: 0,
      costUsd: 0,
      costJpy: 0,
      latencyMs: Date.now() - started,
      repaired: false,
      error: parsed.success ? null : "mock schema mismatch",
    };
  }

  const messages = input.messages.some((m) => /json/i.test(m.content))
    ? input.messages
    : [{ role: "system" as const, content: "Respond with a JSON object." }, ...input.messages];

  const body = {
    model: requestedModel,
    messages,
    temperature: MODEL_PARAMS.temperature,
    max_tokens: MODEL_PARAMS.maxTokens,
    response_format: {
      type: "json_object" as const,
    },
  };

  const attempt = async (): Promise<LlmCallResult<T>> => {
    const res = await fetch(`${env.orcaBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.orcaApiKey}`,
        "Content-Type": "application/json",
        "X-OrcaRouter-Include-Cost": "true",
      },
      body: JSON.stringify(body),
      signal: input.signal ?? AbortSignal.timeout(25000),
    });
    const latencyMs = Date.now() - started;
    const actualModel =
      res.headers.get("X-Orca-Resolved-Model") ??
      res.headers.get("x-orca-resolved-model") ??
      "unknown";
    if (!res.ok) {
      return {
        data: null,
        ok: false,
        requestedModel,
        actualModel,
        pool,
        promptTokens: null,
        completionTokens: null,
        costUsd: null,
        costJpy: null,
        latencyMs,
        repaired: false,
        error: `orcarouter ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        cost_usd?: number;
      };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = null;
    }
    const checked = input.schema.safeParse(parsed);
    return {
      data: checked.success ? checked.data : null,
      ok: checked.success,
      requestedModel,
      actualModel: json.model ?? actualModel,
      pool,
      promptTokens: json.usage?.prompt_tokens ?? null,
      completionTokens: json.usage?.completion_tokens ?? null,
      costUsd: json.usage?.cost_usd ?? null,
      costJpy: usdToJpy(json.usage?.cost_usd ?? null),
      latencyMs,
      repaired: false,
      error: checked.success ? null : "schema validation failed",
    };
  };

  const result = await attempt();
  if (!result.ok && result.error === "schema validation failed") {
    const repaired = await attempt();
    repaired.repaired = true;
    return repaired;
  }
  return result;
}

export function estimateFromTable(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const row = LLM_PRICE_TABLE.usdPer1M[model as keyof typeof LLM_PRICE_TABLE.usdPer1M];
  if (!row || promptTokens == null || completionTokens == null) return null;
  const usd = (promptTokens * row.input + completionTokens * row.output) / 1_000_000;
  return usdToJpy(usd);
}

export const llmActionSchema = z.object({
  think: z.string().max(200).optional(),
  selectedSpotIds: z.array(z.string()),
  rejected: z.array(z.object({ spotId: z.string(), reason: z.string() })),
  assumptions: z.array(z.string()),
});
export type LlmAction = z.infer<typeof llmActionSchema>;
