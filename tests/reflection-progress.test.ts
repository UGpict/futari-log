import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reflectionAnalysisProgress } from "../src/domain/reflection/analysisProgress";

describe("reflectionAnalysisProgress", () => {
  const now = Date.parse("2026-09-21T01:00:00.000Z");

  it("marks stalled when PENDING past deadline while run still PENDING", () => {
    const result = reflectionAnalysisProgress({
      analysisStatus: "PENDING",
      run: { status: "PENDING", deadlineAt: "2026-09-21T00:59:50.000Z" },
      nowMs: now,
    });
    assert.equal(result.analysisStalled, true);
    assert.equal(result.analysisRunStatus, "PENDING");
    assert.equal(result.analysisDeadlineAt, "2026-09-21T00:59:50.000Z");
  });

  it("does not stall while within deadline", () => {
    const result = reflectionAnalysisProgress({
      analysisStatus: "PENDING",
      run: { status: "RUNNING", deadlineAt: "2026-09-21T01:00:10.000Z" },
      nowMs: now,
    });
    assert.equal(result.analysisStalled, false);
  });

  it("does not stall on WAITING_INPUT (user response pending)", () => {
    const result = reflectionAnalysisProgress({
      analysisStatus: "WAITING_INPUT",
      run: { status: "WAITING_INPUT", deadlineAt: "2026-09-21T00:59:00.000Z" },
      nowMs: now,
    });
    assert.equal(result.analysisStalled, false);
  });

  it("marks stalled when analysis PENDING but run INTERRUPTED", () => {
    const result = reflectionAnalysisProgress({
      analysisStatus: "PENDING",
      run: { status: "INTERRUPTED", deadlineAt: "2026-09-21T01:00:10.000Z" },
      nowMs: now,
    });
    assert.equal(result.analysisStalled, true);
  });
});
