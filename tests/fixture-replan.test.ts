import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureSuccess } from "../src/fixtures/snapshots";
import { createFixtureReplan } from "../src/fixtures/replan-proposal";
import { proposalRows } from "../src/features/session/proposal-rows";

function snapshot(targetPlanItemId?: string) {
  const data = structuredClone(fixtureSuccess);
  data.runs.push({ ...data.runs[0], id: "replan-test", kind: "REPLAN", targetPlanItemId });
  return data;
}
test("whole-day sample exposes independent proposals on all three cards", () => {
  const data = snapshot();
  const result = createFixtureReplan(data)!;
  const rows = proposalRows(data.plan!.items, result.proposal.items, result.approval.diff);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.change === "replace"));
  assert.equal(result.approval.diff!.replaced.length, 3);
  assert.equal(new Set(rows.map((row) => row.key)).size, 3);
  rows.forEach((row) => {
    assert.equal(row.current!.startAt, row.proposed!.startAt);
    assert.equal(row.current!.locked, row.proposed!.locked);
  });
  assert.deepEqual(data.plan, fixtureSuccess.plan);
});
test("requesting the third card only changes the third card", () => {
  const data = snapshot(fixtureSuccess.plan!.items[2].id);
  const result = createFixtureReplan(data)!;
  assert.deepEqual(proposalRows(data.plan!.items, result.proposal.items, result.approval.diff).map((row) => row.change), [undefined, undefined, "replace"]);
});
test("another replan derives IDs and versions from the current plan", () => {
  const data = snapshot();
  const first = createFixtureReplan(data)!;
  data.plan = first.proposal;
  data.spots = first.spots;
  data.runs.at(-1)!.id = "replan-next";
  const next = createFixtureReplan(data)!;
  assert.equal(next.proposal.version, first.proposal.version + 1);
  assert.deepEqual(next.approval.diff!.replaced.map((row) => row.fromItemId), first.proposal.items.map((item) => item.id));
});
