/**
 * Phase 2a: structured metric emit for Cloud Logging.
 * Dashboard / alert wiring is Phase 2b — these JSON lines are the export surface.
 *
 * Metric names (design):
 * - futari/external_calls
 * - futari/external_errors
 * - futari/llm_cost_usd
 * - futari/rate_limited
 * - futari/budget_exceeded
 */

export type ExternalMetricProvider = string;

export type MetricLabels = {
  provider?: string;
  kind?: string;
  bucket?: string;
  latency_ms?: number;
  ok?: boolean;
  cost_usd?: number | null;
  error?: string | null;
  subject?: string;
};

function emit(metric: string, labels: MetricLabels, severity: "INFO" | "WARNING" | "ERROR" = "INFO") {
  console.info(
    JSON.stringify({
      severity,
      message: metric,
      metric,
      ...labels,
      // Cloud Logging–friendly timestamp; collectors can scrape `metric` + labels.
      time: new Date().toISOString(),
    }),
  );
}

export function emitExternalCall(labels: {
  provider: ExternalMetricProvider;
  latency_ms: number;
  ok: boolean;
  cost_usd?: number | null;
  cacheHit?: boolean;
}) {
  emit("futari/external_calls", {
    provider: labels.provider,
    latency_ms: labels.latency_ms,
    ok: labels.ok,
    cost_usd: labels.cost_usd ?? null,
  });
  if (!labels.ok) {
    emit(
      "futari/external_errors",
      {
        provider: labels.provider,
        latency_ms: labels.latency_ms,
        ok: false,
      },
      "WARNING",
    );
  }
}

export function emitLlmCost(labels: {
  provider: string;
  pool: string;
  latency_ms: number;
  ok: boolean;
  cost_usd: number | null;
  task?: string;
}) {
  emitExternalCall({
    provider: labels.provider,
    latency_ms: labels.latency_ms,
    ok: labels.ok,
    cost_usd: labels.cost_usd,
  });
  if (labels.cost_usd != null && labels.cost_usd > 0) {
    emit("futari/llm_cost_usd", {
      provider: labels.provider,
      kind: labels.pool,
      latency_ms: labels.latency_ms,
      ok: labels.ok,
      cost_usd: labels.cost_usd,
    });
  }
}

export function emitRateLimited(labels: { bucket: string; subject: string }) {
  emit("futari/rate_limited", { bucket: labels.bucket, subject: labels.subject, ok: false }, "WARNING");
}

export function emitBudgetExceeded(labels: { kind: string }) {
  emit("futari/budget_exceeded", { kind: labels.kind, ok: false }, "WARNING");
}
