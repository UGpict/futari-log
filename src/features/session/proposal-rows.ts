import type { ApprovalChangeDecisionRequest, PlanDiff, SessionSnapshot } from "@/contracts";

type Item = NonNullable<SessionSnapshot["plan"]>["items"][number];
export type ProposalApiChange = ApprovalChangeDecisionRequest["change"];
export type ProposalRow = {
  key: string;
  current?: Item;
  proposed?: Item;
  /** 画面表示用。apiChange があるときだけ操作できる。 */
  change?: "replace" | "time" | "add" | "remove";
  /** `/api/approvals/:id/changes` に送る正式な差分キー。diff と一致するものだけ入る。 */
  apiChange?: ProposalApiChange;
};

/**
 * 現行行程を軸にカードを並べ、approval.diff に残っている変更だけ操作可能にする。
 * 見た目の時刻差だけではボタンを出さない（diff に無い変更を送ると 409 になるため）。
 */
export function proposalRows(current: Item[], proposed?: Item[], diff?: PlanDiff | null): ProposalRow[] {
  if (!proposed || !diff) return current.map((item) => ({ key: item.id, current: item }));
  const used = new Set<string>();
  const rows: ProposalRow[] = current.map((item) => {
    const replacement = diff.replaced.find((row) => row.fromItemId === item.id);
    if (replacement) {
      const next = proposed.find((row) => row.id === replacement.toItemId);
      if (!next) return { key: item.id, current: item };
      used.add(next.id);
      const change = replacement.fromSpotId !== replacement.toSpotId ? "replace" : "time";
      return {
        key: item.id,
        current: item,
        proposed: next,
        change,
        apiChange: {
          kind: "replace",
          fromItemId: replacement.fromItemId,
          toItemId: replacement.toItemId,
        },
      };
    }
    if (diff.removedItemIds.includes(item.id)) {
      return {
        key: item.id,
        current: item,
        change: "remove",
        apiChange: { kind: "remove", itemId: item.id },
      };
    }
    const next =
      proposed.find((row) => row.id === item.id) ??
      proposed.find((row) => row.spotId === item.spotId && !used.has(row.id));
    if (!next) return { key: item.id, current: item };
    used.add(next.id);
    const shift = diff.timeShifts.find((row) => row.itemId === next.id);
    if (shift) {
      return {
        key: item.id,
        current: item,
        proposed: next,
        change: "time",
        apiChange: { kind: "time", itemId: next.id, fromItemId: item.id },
      };
    }
    return { key: item.id, current: item, proposed: next };
  });
  proposed.forEach((item, index) => {
    if (used.has(item.id)) return;
    if (!diff.addedItemIds.includes(item.id)) return;
    const following = proposed.slice(index + 1).find((next) => used.has(next.id));
    const insertion = following ? rows.findIndex((row) => row.proposed?.id === following.id) : -1;
    rows.splice(insertion < 0 ? rows.length : insertion, 0, {
      key: `added:${item.id}`,
      proposed: item,
      change: "add",
      apiChange: { kind: "add", itemId: item.id },
    });
    used.add(item.id);
  });
  return rows;
}
