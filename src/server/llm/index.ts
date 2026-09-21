import { getEnv } from "@/config/env";
import { LLM_PRICE_TABLE, MODEL_PARAMS } from "@/config/settings";
import type { AppEvent } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import { maskPii } from "@/server/privacy/mask";
import { appendRunEvent, nextEventSeq } from "@/server/repositories/store";
import { z, type ZodType } from "zod";
import { orcaBase, orcaHeaders, usdToJpy, usageFromOrca } from "./usage";

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

/**
 * Masked LLM failure body truncate length for logs + run events.
 * LIVE sample failure used ~82 completion tokens (~300–400 chars of JSON).
 * 800 chars keeps typical short failures intact for Zod diagnosis while
 * bounding Firestore event / Cloud Logging payload size (not a full max_tokens dump).
 */
export const LLM_FAILURE_CONTENT_CHARS = 800;

export type LlmParseFailureKind = "json_parse_failed" | "schema_validation_failed";

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

export function previewMaskedLlmContent(content: string, maxChars = LLM_FAILURE_CONTENT_CHARS): string {
  const masked = maskPii(content).masked;
  if (masked.length <= maxChars) return masked;
  return `${masked.slice(0, maxChars)}…`;
}

/** Classify JSON.parse vs Zod failure without collapsing both to one error string. */
export function classifyLlmJsonAgainstSchema<T>(
  content: string,
  schema: ZodType<T>,
): {
  kind: LlmParseFailureKind | null;
  data: T | null;
  zodFlatten: ReturnType<z.ZodError["flatten"]> | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "json_parse_failed", data: null, zodFlatten: null };
  }
  const checked = schema.safeParse(parsed);
  if (checked.success) {
    return { kind: null, data: checked.data, zodFlatten: null };
  }
  return {
    kind: "schema_validation_failed",
    data: null,
    zodFlatten: checked.error.flatten(),
  };
}

function errorMessageForKind(kind: LlmParseFailureKind): string {
  return kind === "json_parse_failed" ? "json parse failed" : "schema validation failed";
}

async function recordLlmParseFailure(input: {
  runId: string;
  task: LlmTask;
  attempt: number;
  repaired: boolean;
  kind: LlmParseFailureKind;
  content: string;
  zodFlatten: ReturnType<z.ZodError["flatten"]> | null;
  requestedModel: string;
  actualModel: string;
}): Promise<void> {
  const contentPreview = previewMaskedLlmContent(input.content);
  const payload = {
    agent: "llm" as const,
    task: input.task,
    attempt: input.attempt,
    repaired: input.repaired,
    failureKind: input.kind,
    contentPreview,
    contentTruncated: maskPii(input.content).masked.length > LLM_FAILURE_CONTENT_CHARS,
    zodFlatten: input.zodFlatten,
    requestedModel: input.requestedModel,
    actualModel: input.actualModel,
  };

  // Structured log: Cloud Logging retention (typically 30d default) — full diagnostic shape.
  console.info(
    JSON.stringify({
      severity: "WARNING",
      message: "llm_parse_failure",
      runId: input.runId,
      ...payload,
    }),
  );

  // Run event: durable with the session for postmortem; same truncated preview (no raw PII).
  try {
    const seq = await nextEventSeq(input.runId);
    const event: AppEvent = {
      eventId: newId("evt"),
      runId: input.runId,
      seq,
      at: realNowIso(),
      type: "NOTICE",
      summary: `LLM ${input.kind} (attempt ${input.attempt})`,
      evidenceIds: [],
      model: input.actualModel,
      pool: null,
      requestedModel: input.requestedModel,
      actualModel: input.actualModel,
      usage: null,
      payload,
    };
    await appendRunEvent(input.runId, event);
  } catch (error) {
    console.error(
      JSON.stringify({
        severity: "ERROR",
        message: "llm_parse_failure_event_write_failed",
        runId: input.runId,
        error: error instanceof Error ? error.message : "unknown",
      }),
    );
  }
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

  const attempt = async (
    attemptNo: number,
    repaired: boolean,
  ): Promise<LlmCallResult<T>> => {
    const res = await fetch(`${orcaBase()}/chat/completions`, {
      method: "POST",
      headers: orcaHeaders(),
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
    const classified = classifyLlmJsonAgainstSchema(content, input.schema);
    const usage = usageFromOrca(json);
    const resolvedModel = json.model ?? actualModel;
    if (classified.kind) {
      await recordLlmParseFailure({
        runId: input.runId,
        task: input.task,
        attempt: attemptNo,
        repaired,
        kind: classified.kind,
        content,
        zodFlatten: classified.zodFlatten,
        requestedModel,
        actualModel: resolvedModel,
      });
    }
    return {
      data: classified.data,
      ok: classified.kind == null,
      requestedModel,
      actualModel: resolvedModel,
      pool,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      costUsd: usage.costUsd,
      costJpy: usage.costJpy,
      latencyMs,
      repaired: false,
      error: classified.kind ? errorMessageForKind(classified.kind) : null,
    };
  };

  const result = await attempt(1, false);
  if (
    !result.ok &&
    (result.error === "schema validation failed" || result.error === "json parse failed")
  ) {
    const repaired = await attempt(2, true);
    repaired.repaired = true;
    return repaired;
  }
  return result;
}

/** OrcaRouter JSON。キーがあるときは MOCK runtime でも実呼び出しする（収集の構造化用） */
export async function callOrcaJson<T>(input: {
  messages: { role: "system" | "user"; content: string }[];
  schema: ZodType<T>;
  model?: string;
  signal?: AbortSignal;
}): Promise<LlmCallResult<T>> {
  const env = getEnv();
  const requestedModel = input.model ?? env.orcaMundaneModel;
  const started = Date.now();
  if (!env.orcaApiKey) {
    return {
      data: null,
      ok: false,
      requestedModel,
      actualModel: "none",
      pool: "mundane",
      promptTokens: null,
      completionTokens: null,
      costUsd: null,
      costJpy: null,
      latencyMs: Date.now() - started,
      repaired: false,
      error: "ORCAROUTER_API_KEY missing",
    };
  }
  const messages = input.messages.some((m) => /json/i.test(m.content))
    ? input.messages
    : [{ role: "system" as const, content: "Respond with a JSON object." }, ...input.messages];
  const res = await fetch(`${orcaBase()}/chat/completions`, {
    method: "POST",
    headers: orcaHeaders(),
    body: JSON.stringify({
      model: requestedModel,
      messages,
      temperature: MODEL_PARAMS.temperature,
      max_tokens: MODEL_PARAMS.maxTokens,
      response_format: { type: "json_object" as const },
    }),
    signal: input.signal ?? AbortSignal.timeout(25000),
  });
  const latencyMs = Date.now() - started;
  const actualModel =
    res.headers.get("X-Orca-Resolved-Model") ?? res.headers.get("x-orca-resolved-model") ?? "unknown";
  if (!res.ok) {
    return {
      data: null,
      ok: false,
      requestedModel,
      actualModel,
      pool: "mundane",
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
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost_usd?: number };
  };
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "");
  } catch {
    parsed = extractJsonObject(json.choices?.[0]?.message?.content ?? "");
  }
  const checked = input.schema.safeParse(parsed);
  const usage = usageFromOrca(json);
  return {
    data: checked.success ? checked.data : null,
    ok: checked.success,
    requestedModel,
    actualModel: json.model ?? actualModel,
    pool: "mundane",
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: usage.costUsd,
    costJpy: usage.costJpy,
    latencyMs,
    repaired: false,
    error: checked.success ? null : "schema validation failed",
  };
}

function extractJsonObject(content: string): unknown {
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence?.[1] ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const a = candidate.indexOf("[");
    const b = candidate.lastIndexOf("]");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(candidate.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
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
  think: z.string().max(400).optional(),
  selectedSpotIds: z.array(z.string()).default([]),
  rejected: z.array(z.object({ spotId: z.string(), reason: z.string() })).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type LlmAction = z.infer<typeof llmActionSchema>;
