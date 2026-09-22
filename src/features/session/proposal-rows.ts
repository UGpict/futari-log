import type { PlanDiff, SessionSnapshot } from "@/contracts";

type Item = NonNullable<SessionSnapshot["plan"]>["items"][number];
export type ProposalRow = {
  key: string;
  current?: Item;
  proposed?: Item;
  change?: "replace" | "time" | "add" | "remove";
};

// Keep existing cards anchored; insert new stops beside their proposed neighbours.
export function proposalRows(current: Item[], proposed?: Item[], diff?: PlanDiff | null): ProposalRow[] {
  if (!proposed || !diff) return current.map((item) => ({ key: item.id, current: item }));
  const used = new Set<string>();
  const rows: ProposalRow[] = current.map((item) => {
    const replacement = diff.replaced.find((row) => row.fromItemId === item.id);
    const next = replacement
      ? proposed.find((row) => row.id === replacement.toItemId)
      : proposed.find((row) => row.id === item.id) ?? proposed.find((row) => row.spotId === item.spotId && !used.has(row.id));
    if (diff.removedItemIds.includes(item.id) && !replacement) return { key: item.id, current: item, change: "remove" };
    if (!next) return { key: item.id, current: item, change: "remove" };
    used.add(next.id);
    const change = item.spotId !== next.spotId ? "replace" : item.startAt !== next.startAt || item.endAt !== next.endAt ? "time" : undefined;
    return { key: item.id, current: item, proposed: next, change };
  });
  proposed.forEach((item, index) => {
    if (used.has(item.id)) return;
    const following = proposed.slice(index + 1).find((next) => used.has(next.id));
    const insertion = following ? rows.findIndex((row) => row.proposed?.id === following.id) : -1;
    rows.splice(insertion < 0 ? rows.length : insertion, 0, { key: `added:${item.id}`, proposed: item, change: "add" });
    used.add(item.id);
  });
  return rows;
}
