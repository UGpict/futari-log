/** 振り返り分析 run の停滞判定。クライアントがポーリングで検知する。 */

const IN_FLIGHT = new Set(["PENDING", "RUNNING"]);
const ABORTED = new Set(["INTERRUPTED", "FAILED", "CANCELLED"]);

export function reflectionAnalysisProgress(input: {
  analysisStatus: string;
  run: { status: string; deadlineAt: string | null } | null | undefined;
  nowMs?: number;
}): {
  analysisRunStatus: string | null;
  analysisDeadlineAt: string | null;
  /** deadline 超過のまま PENDING/RUNNING、または lease 切れ等で中断され分析が PENDING のまま */
  analysisStalled: boolean;
} {
  const run = input.run ?? null;
  const now = input.nowMs ?? Date.now();
  if (!run) {
    return {
      analysisRunStatus: null,
      analysisDeadlineAt: null,
      analysisStalled: input.analysisStatus === "PENDING",
    };
  }
  const pastDeadline =
    run.deadlineAt != null && Number.isFinite(Date.parse(run.deadlineAt))
      ? Date.parse(run.deadlineAt) < now
      : false;
  const stalled =
    input.analysisStatus === "PENDING" &&
    (ABORTED.has(run.status) || (pastDeadline && IN_FLIGHT.has(run.status)));
  return {
    analysisRunStatus: run.status,
    analysisDeadlineAt: run.deadlineAt,
    analysisStalled: stalled,
  };
}
