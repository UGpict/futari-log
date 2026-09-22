import assert from "node:assert/strict";
import { test } from "node:test";
import { fixtureSuccess } from "../src/fixtures/snapshots";
import { createFixtureReplan } from "../src/fixtures/replan-proposal";
import { decideFixtureProposal } from "../src/fixtures/proposal-decision";
import { proposalRows } from "../src/features/session/proposal-rows";

function setup() {
  const snapshot = structuredClone(fixtureSuccess);
  snapshot.runs = [{ ...snapshot.runs[0], id: "individual-test", kind: "REPLAN", status: "WAITING_APPROVAL" }];
  const result = createFixtureReplan(snapshot)!;
  snapshot.proposedPlan = result.proposal;
  snapshot.approvals = [result.approval];
  snapshot.spots = result.spots;
  return snapshot;
}
test("mixed choices apply only approved cards and finish after the last choice", () => {
  const snapshot = setup();
  const original = structuredClone(snapshot.plan!);
  const proposed = structuredClone(snapshot.proposedPlan!);
  const approvalId = snapshot.approvals[0].id;
  decideFixtureProposal(snapshot, approvalId, original.items[1].id, "APPROVE");
  assert.deepEqual(snapshot.plan!.items, [original.items[0], proposed.items[1], original.items[2]]);
  assert.equal(proposalRows(snapshot.plan!.items, snapshot.proposedPlan!.items, snapshot.approvals[0].diff).filter(row => row.change).length, 2);
  decideFixtureProposal(snapshot, approvalId, original.items[0].id, "REJECT");
  assert.equal(snapshot.plan!.items[0].spotId, original.items[0].spotId);
  assert.equal(snapshot.runs[0].status, "WAITING_APPROVAL");
  decideFixtureProposal(snapshot, approvalId, original.items[2].id, "APPROVE");
  assert.deepEqual(snapshot.plan!.items, [original.items[0], proposed.items[1], proposed.items[2]]);
  assert.equal(snapshot.proposedPlan, undefined);
  assert.equal(snapshot.runs[0].status, "SUCCEEDED");
  assert.equal(snapshot.approvals[0].status, "APPROVED");
});
test("rejecting all cards preserves the plan and closes the proposal", () => {
  const snapshot = setup();
  const original = structuredClone(snapshot.plan!);
  for (const item of original.items) decideFixtureProposal(snapshot, snapshot.approvals[0].id, item.id, "REJECT");
  assert.deepEqual(snapshot.plan, original);
  assert.equal(snapshot.approvals[0].status, "REJECTED");
  assert.equal(snapshot.proposedPlan, undefined);
});
test("duplicate decisions do not change another card", () => {
  const snapshot = setup();
  const id = snapshot.plan!.items[0].id;
  decideFixtureProposal(snapshot, snapshot.approvals[0].id, id, "APPROVE");
  const before = structuredClone(snapshot);
  assert.throws(() => decideFixtureProposal(snapshot, snapshot.approvals[0].id, id, "APPROVE"));
  assert.deepEqual(snapshot, before);
});
