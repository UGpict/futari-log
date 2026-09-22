import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  changeExistsInDiff,
  hasRemainingDiff,
  mergePartialPlan,
  selectionForChange,
  stripChangeFromDiff,
  type PartialAcceptSelection,
} from "../src/domain/plan/mergePartialPlan";
import type { Plan, PlanDiff } from "../src/domain/schemas";

function item(id: string, spotId: string, start: string, end: string) {
  return {
    id,
    spotId,
    startAt: start,
    endAt: end,
    progress: "NOT_STARTED" as const,
    locked: false,
    lockReason: null,
    matchesPreferenceIds: [],
    memoryIds: [],
    reason: id,
    evidenceIds: [],
  };
}

function basePlan(over: Partial<Plan> = {}): Plan {
  return {
    version: 1,
    items: [
      item("i1", "s1", "2026-09-22T11:00:00+09:00", "2026-09-22T12:00:00+09:00"),
      item("i2", "s2", "2026-09-22T13:00:00+09:00", "2026-09-22T14:00:00+09:00"),
    ],
    legs: [
      {
        id: "leg1",
        from: "MEET",
        fromSpotId: null,
        to: "SPOT",
        toSpotId: "s1",
        mode: "WALK",
        departureAt: "2026-09-22T10:40:00+09:00",
        durationMinutes: { value: 20, evidenceIds: [] },
        distanceMeters: { value: 1000, evidenceIds: [] },
        delayMinutesInjected: null,
        evidenceIds: [],
      },
      {
        id: "leg2",
        from: "SPOT",
        fromSpotId: "s1",
        to: "SPOT",
        toSpotId: "s2",
        mode: "WALK",
        departureAt: "2026-09-22T12:00:00+09:00",
        durationMinutes: { value: 15, evidenceIds: [] },
        distanceMeters: { value: 800, evidenceIds: [] },
        delayMinutesInjected: null,
        evidenceIds: [],
      },
      {
        id: "leg3",
        from: "SPOT",
        fromSpotId: "s2",
        to: "END",
        toSpotId: null,
        mode: "WALK",
        departureAt: "2026-09-22T14:00:00+09:00",
        durationMinutes: { value: 10, evidenceIds: [] },
        distanceMeters: { value: 500, evidenceIds: [] },
        delayMinutesInjected: null,
        evidenceIds: [],
      },
    ],
    openings: [],
    assumptions: [],
    validation: { state: "PASS", issues: [] },
    planB: [],
    costEstimate: {
      mealsJpy: { value: null, evidenceIds: [] },
      facilitiesJpy: { value: null, evidenceIds: [] },
      transitJpy: { value: null, evidenceIds: [] },
      totalJpy: { value: null, evidenceIds: [] },
    },
    dataMode: "LIVE",
    memoryInfluences: [],
    ...over,
  };
}

describe("mergePartialPlan", () => {
  const from = basePlan();
  const to = basePlan({
    version: 2,
    items: [
      item("j1", "s9", "2026-09-22T11:00:00+09:00", "2026-09-22T12:00:00+09:00"),
      item("j2", "s2", "2026-09-22T13:30:00+09:00", "2026-09-22T14:30:00+09:00"),
    ],
  });
  const diff: PlanDiff = {
    fromVersion: 1,
    toVersion: 2,
    keptItemIds: [],
    replaced: [{ fromItemId: "i1", toItemId: "j1", fromSpotId: "s1", toSpotId: "s9" }],
    addedItemIds: [],
    removedItemIds: [],
    timeShifts: [{ itemId: "j2", startDeltaMin: 30, endDeltaMin: 30 }],
    summary: "test",
  };

  it("applies only the accepted replace", () => {
    const selection: PartialAcceptSelection = {
      ...selectionForChange({ kind: "replace", fromItemId: "i1", toItemId: "j1" }),
    };
    const merged = mergePartialPlan({ from, to, diff, selection, nextVersion: 3 });
    assert.equal(merged.items[0]?.spotId, "s9");
    assert.equal(merged.items[1]?.spotId, "s2");
    assert.equal(merged.items[1]?.startAt, from.items[1].startAt);
    assert.equal(merged.version, 3);
  });

  it("emits legs with bufferMinutes so session DTO parse succeeds", () => {
    const selection = selectionForChange({ kind: "replace", fromItemId: "i1", toItemId: "j1" });
    const merged = mergePartialPlan({ from, to, diff, selection, nextVersion: 3 });
    for (const leg of merged.legs) {
      assert.equal(typeof leg.bufferMinutes, "number");
    }
  });

  it("strips and detects remaining diff changes", () => {
    assert.equal(changeExistsInDiff(diff, { kind: "replace", fromItemId: "i1", toItemId: "j1" }), true);
    const next = stripChangeFromDiff(diff, { kind: "replace", fromItemId: "i1", toItemId: "j1" });
    assert.equal(changeExistsInDiff(next, { kind: "replace", fromItemId: "i1", toItemId: "j1" }), false);
    assert.equal(hasRemainingDiff(next), true);
    const done = stripChangeFromDiff(next, { kind: "time", itemId: "j2" });
    assert.equal(hasRemainingDiff(done), false);
  });
});
