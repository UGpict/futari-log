import type { SessionSnapshot } from "@/contracts";
import { fixtureApproval } from "./snapshots";

// UI-only sample: derive every proposal from the currently displayed itinerary.
export function createFixtureReplan(snapshot: SessionSnapshot) {
  const run = snapshot.runs.at(-1);
  if (!snapshot.plan || !run) return null;
  const proposal = structuredClone(snapshot.plan);
  proposal.version = snapshot.plan.version + 1;
  const approval = structuredClone(fixtureApproval.approvals[0]);
  approval.id = `appr_${run.id}`;
  approval.sessionId = snapshot.session.id;
  approval.runId = run.id;
  approval.planVersionFrom = snapshot.plan.version;
  approval.planVersionTo = proposal.version;
  approval.summary = run.targetPlanItemId ? "この予定の別案です" : "一日の予定をそれぞれ見直しました";
  const diff = approval.diff!;
  diff.fromVersion = snapshot.plan.version;
  diff.toVersion = proposal.version;
  diff.summary = approval.summary;
  diff.replaced = [];
  diff.keptItemIds = [];
  diff.addedItemIds = [];
  diff.removedItemIds = [];
  diff.timeShifts = [];
  const spots = structuredClone(snapshot.spots);
  const replacements = new Map<string, string>();
  proposal.items = snapshot.plan.items.map((item, index) => {
    if (run.targetPlanItemId && item.id !== run.targetPlanItemId) {
      diff.keptItemIds.push(item.id);
      return structuredClone(item);
    }
    const source = snapshot.spots[item.spotId];
    const spotId = `mock:replan-${run.id}-${index}`;
    const id = `proposal-${proposal.version}-${index}`;
    // Explicitly fictional alternatives, preserving times and fixed-time flags.
    spots[spotId] = { ...structuredClone(source), id: spotId, name: `${source?.name ?? "立ち寄り先"}の別候補（サンプル）` };
    replacements.set(item.spotId, spotId);
    diff.replaced.push({ fromItemId: item.id, toItemId: id, fromSpotId: item.spotId, toSpotId: spotId });
    return { ...structuredClone(item), id, spotId, reason: item.locked ? "時間固定の条件を保った変更案です（サンプル）" : "希望に合わせて選んだ別の候補です（サンプル）" };
  });
  proposal.legs = proposal.legs.map((leg) => ({ ...leg,
    fromSpotId: leg.fromSpotId ? replacements.get(leg.fromSpotId) ?? leg.fromSpotId : leg.fromSpotId,
    toSpotId: leg.toSpotId ? replacements.get(leg.toSpotId) ?? leg.toSpotId : leg.toSpotId,
  }));
  return { proposal, approval, spots };
}
