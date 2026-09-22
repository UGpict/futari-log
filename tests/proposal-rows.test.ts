import assert from "node:assert/strict";
import { test } from "node:test";
import { proposalRows } from "../src/features/session/proposal-rows";
import { fixtureApproval, fixtureSuccess } from "../src/fixtures/snapshots";
import { resolveChangeInDiff } from "../src/domain/plan/mergePartialPlan";

const current = fixtureSuccess.plan!.items;
const diff = fixtureApproval.approvals[0].diff!;
test("whole-plan replacement stays at its original card; unaffected stops remain", () => {
  const rows = proposalRows(current, fixtureApproval.proposedPlan!.items, diff);
  assert.deepEqual(rows.map((row) => row.change), ["replace", undefined, undefined]);
  assert.equal(rows[0].current?.id, "it_1");
  assert.equal(rows[0].proposed?.id, "it_new");
  assert.deepEqual(rows[0].apiChange, { kind: "replace", fromItemId: "it_1", toItemId: "it_new" });
  assert.equal(rows[1].apiChange, undefined);
});
test("multiple replacements and time changes each appear once", () => {
  const next = structuredClone(fixtureApproval.proposedPlan!.items);
  next[1].startAt = next[1].startAt.replace("15:00", "15:10");
  next[2] = { ...next[2], id: "replacement-3", spotId: "new-spot-3" };
  const nextDiff = {
    ...diff,
    replaced: [...diff.replaced, { fromItemId: current[2].id, toItemId: next[2].id, fromSpotId: current[2].spotId, toSpotId: next[2].spotId }],
    timeShifts: [{ itemId: next[1].id, startDeltaMin: 10, endDeltaMin: 10 }],
  };
  const rows = proposalRows(current, next, nextDiff);
  assert.deepEqual(rows.map((row) => row.change), ["replace", "time", "replace"]);
  assert.equal(new Set(rows.map((row) => row.proposed?.id)).size, 3);
  assert.deepEqual(rows[1].apiChange, { kind: "time", itemId: next[1].id, fromItemId: current[1].id });
});
test("visual time drift without diff.timeShifts is not actionable", () => {
  const next = structuredClone(fixtureApproval.proposedPlan!.items);
  next[1].startAt = next[1].startAt.replace("15:00", "15:10");
  const rows = proposalRows(current, next, { ...diff, timeShifts: [] });
  assert.equal(rows[1].change, undefined);
  assert.equal(rows[1].apiChange, undefined);
});
test("additions are inserted by their next stop; removals keep their original card", () => {
  const added = { ...current[0], id: "added", spotId: "new-spot" };
  const next = [current[0], added, current[2]];
  const rows = proposalRows(current, next, { ...diff, replaced: [], removedItemIds: [current[1].id], addedItemIds: [added.id] });
  assert.deepEqual(rows.map((row) => row.change), [undefined, "remove", "add", undefined]);
  assert.equal(rows[2].proposed?.id, "added");
  assert.deepEqual(rows[1].apiChange, { kind: "remove", itemId: current[1].id });
  assert.deepEqual(rows[2].apiChange, { kind: "add", itemId: "added" });
});
test("without a pending proposal only current cards appear", () => {
  assert.deepEqual(proposalRows(current).map((row) => row.current), current);
  assert.ok(proposalRows(current).every((row) => !row.change && !row.apiChange));
});
test("resolveChangeInDiff maps mistaken time kind onto replace entries", () => {
  const resolved = resolveChangeInDiff(diff, { kind: "time", itemId: "it_new", fromItemId: "it_1" });
  assert.deepEqual(resolved, { kind: "replace", fromItemId: "it_1", toItemId: "it_new" });
  assert.equal(resolveChangeInDiff(diff, { kind: "time", itemId: "missing" }), null);
});
