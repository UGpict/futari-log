import type { SessionSnapshot } from "@/contracts";
import { proposalRows } from "@/features/session/proposal-rows";

// Only used by the in-memory UI fixture API, never a live endpoint.
export function decideFixtureProposal(snapshot: SessionSnapshot, approvalId: string, rowKey: string, decision: "APPROVE" | "REJECT") {
  const approval = snapshot.approvals.find((entry) => entry.id === approvalId && entry.status === "PENDING");
  const current = snapshot.plan;
  const proposed = snapshot.proposedPlan;
  if (!approval?.diff || !current || !proposed) throw new Error("変更案が見つかりませんでした");
  const row = proposalRows(current.items, proposed.items, approval.diff).find((entry) => entry.key === rowKey && entry.change);
  if (!row) throw new Error("この変更案はすでに確認済みです");
  const target = decision === "APPROVE" ? current : proposed;
  const before = decision === "APPROVE" ? row.current : row.proposed;
  const after = decision === "APPROVE" ? row.proposed : row.current;
  const index = before ? target.items.findIndex((item) => item.id === before.id) : -1;
  if (index >= 0) target.items.splice(index, 1, ...(after ? [structuredClone(after)] : []));
  else if (after) {
    target.items.push(structuredClone(after));
    target.items.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  if (before) {
    target.legs = target.legs.filter((leg) => after || (leg.fromSpotId !== before.spotId && leg.toSpotId !== before.spotId)).map((leg) => ({ ...leg,
      fromSpotId: leg.fromSpotId === before.spotId && after ? after.spotId : leg.fromSpotId,
      toSpotId: leg.toSpotId === before.spotId && after ? after.spotId : leg.toSpotId,
    }));
  }
  const diff = approval.diff;
  diff.replaced = diff.replaced.filter((entry) => entry.fromItemId !== row.current?.id);
  diff.removedItemIds = diff.removedItemIds.filter((id) => id !== row.current?.id);
  diff.addedItemIds = diff.addedItemIds.filter((id) => id !== row.proposed?.id);
  diff.timeShifts = diff.timeShifts.filter((entry) => entry.itemId !== row.proposed?.id);
  diff.keptItemIds = current.items.filter((item) => proposed.items.some((next) => next.id === item.id)).map((item) => item.id);
  if (decision === "APPROVE") {
    current.version = proposed.version;
    snapshot.session.currentPlanVersion = current.version;
  }
  if (!proposalRows(current.items, proposed.items, diff).some((entry) => entry.change)) {
    approval.status = current.version === approval.planVersionFrom ? "REJECTED" : "APPROVED";
    approval.consumedAt = new Date().toISOString();
    snapshot.proposedPlan = undefined;
    const run = snapshot.runs.find((entry) => entry.id === approval.runId);
    if (run) { run.status = "SUCCEEDED"; run.waitingApprovalId = null; run.finishedAt = new Date().toISOString(); }
  }
}
