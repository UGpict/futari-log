import type { Plan, PlanDiff, TravelLeg } from "@/domain/schemas";

export type PartialAcceptSelection = {
  /** diff.replaced の fromItemId */
  acceptFromItemIds: string[];
  /** diff.timeShifts の itemId（提案側） */
  acceptTimeShiftItemIds: string[];
  acceptAddedItemIds: string[];
  acceptRemovedItemIds: string[];
};

function legKey(leg: Pick<TravelLeg, "from" | "to" | "fromSpotId" | "toSpotId">) {
  return `${leg.from}:${leg.fromSpotId ?? ""}->${leg.to}:${leg.toSpotId ?? ""}`;
}

function findLeg(
  plans: Plan[],
  from: TravelLeg["from"],
  to: TravelLeg["to"],
  fromSpotId: string | null,
  toSpotId: string | null,
): TravelLeg | null {
  const key = `${from}:${fromSpotId ?? ""}->${to}:${toSpotId ?? ""}`;
  for (const plan of plans) {
    const hit = plan.legs.find((leg) => legKey(leg) === key);
    if (hit) return hit;
  }
  return null;
}

function cloneLeg(leg: TravelLeg, suffix: string): TravelLeg {
  return { ...leg, id: `${leg.id}:${suffix}`, bufferMinutes: leg.bufferMinutes ?? 0 };
}

/**
 * 承認待ちの提案から、ユーザーが選んだ差分だけを現行行程へマージする。
 * 移動は from/to のどちらかに同じ区間があれば流用。無ければ duration null の UNKNOWN 相当を残す。
 */
export function mergePartialPlan(input: {
  from: Plan;
  to: Plan;
  diff: PlanDiff;
  selection: PartialAcceptSelection;
  nextVersion: number;
}): Plan {
  const acceptReplace = new Set(input.selection.acceptFromItemIds);
  const acceptShift = new Set(input.selection.acceptTimeShiftItemIds);
  const acceptAdded = new Set(input.selection.acceptAddedItemIds);
  const acceptRemoved = new Set(input.selection.acceptRemovedItemIds);

  const replaceByFrom = new Map(input.diff.replaced.map((row) => [row.fromItemId, row]));
  const toById = new Map(input.to.items.map((item) => [item.id, item]));
  const toBySpot = new Map(input.to.items.map((item) => [item.spotId, item]));

  const items = [];
  for (const fromItem of input.from.items) {
    if (input.diff.removedItemIds.includes(fromItem.id) && acceptRemoved.has(fromItem.id)) {
      continue;
    }
    const rep = replaceByFrom.get(fromItem.id);
    if (rep && acceptReplace.has(fromItem.id)) {
      const next = toById.get(rep.toItemId);
      if (next) {
        items.push({ ...next });
        continue;
      }
    }
    const shifted = toBySpot.get(fromItem.spotId);
    if (shifted && acceptShift.has(shifted.id) && shifted.spotId === fromItem.spotId) {
      items.push({
        ...fromItem,
        startAt: shifted.startAt,
        endAt: shifted.endAt,
      });
      continue;
    }
    items.push({ ...fromItem });
  }

  for (const addedId of input.diff.addedItemIds) {
    if (!acceptAdded.has(addedId)) continue;
    const added = toById.get(addedId);
    if (added) items.push({ ...added });
  }

  const openingsBySpot = new Map<string, (typeof input.from.openings)[number]>();
  for (const opening of [...input.from.openings, ...input.to.openings]) {
    openingsBySpot.set(opening.spotId, opening);
  }
  const openings = items
    .map((item) => openingsBySpot.get(item.spotId))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const legs: TravelLeg[] = [];
  const route = items;
  for (let index = 0; index <= route.length; index += 1) {
    const fromKind = index === 0 ? ("MEET" as const) : ("SPOT" as const);
    const toKind = index === route.length ? ("END" as const) : ("SPOT" as const);
    const fromSpotId = index === 0 ? null : route[index - 1]!.spotId;
    const toSpotId = index === route.length ? null : route[index]!.spotId;
    const existing = findLeg([input.to, input.from], fromKind, toKind, fromSpotId, toSpotId);
    if (existing) {
      legs.push(cloneLeg(existing, `v${input.nextVersion}`));
      continue;
    }
    const departureAt =
      index === 0
        ? route[0]?.startAt ?? input.from.legs[0]?.departureAt ?? new Date().toISOString()
        : route[index - 1]!.endAt;
    legs.push({
      id: `leg_partial_${input.nextVersion}_${index}`,
      from: fromKind,
      fromSpotId,
      to: toKind,
      toSpotId,
      mode: input.from.legs[0]?.mode ?? input.to.legs[0]?.mode ?? "WALK",
      departureAt,
      durationMinutes: { value: null, evidenceIds: [] },
      distanceMeters: { value: null, evidenceIds: [] },
      bufferMinutes: 0,
      delayMinutesInjected: null,
      evidenceIds: [],
    });
  }

  return {
    version: input.nextVersion,
    items,
    legs,
    openings,
    assumptions: [
      ...input.from.assumptions.filter((line) => !line.startsWith("部分承認:")),
      "部分承認: 選んだ変更だけを反映した",
    ],
    validation: { state: "CONDITIONAL", issues: [] },
    planB: input.from.planB,
    costEstimate: input.to.costEstimate,
    dataMode: input.to.dataMode,
    memoryInfluences: input.to.memoryInfluences.length
      ? input.to.memoryInfluences
      : input.from.memoryInfluences,
  };
}

/** 提案の実質差分をすべて受理しているか。 */
export function isFullAccept(diff: PlanDiff, selection: PartialAcceptSelection): boolean {
  const replaceOk = diff.replaced.every((row) => selection.acceptFromItemIds.includes(row.fromItemId));
  const shiftOk = diff.timeShifts.every((row) => selection.acceptTimeShiftItemIds.includes(row.itemId));
  const addedOk = diff.addedItemIds.every((id) => selection.acceptAddedItemIds.includes(id));
  const removedOk = diff.removedItemIds.every((id) => selection.acceptRemovedItemIds.includes(id));
  return replaceOk && shiftOk && addedOk && removedOk;
}

export function isEmptyAccept(selection: PartialAcceptSelection): boolean {
  return (
    selection.acceptFromItemIds.length === 0 &&
    selection.acceptTimeShiftItemIds.length === 0 &&
    selection.acceptAddedItemIds.length === 0 &&
    selection.acceptRemovedItemIds.length === 0
  );
}

export type DiffChangeRef =
  | { kind: "replace"; fromItemId: string; toItemId: string }
  | { kind: "time"; itemId: string; fromItemId?: string }
  | { kind: "add"; itemId: string }
  | { kind: "remove"; itemId: string };

export function emptySelection(): PartialAcceptSelection {
  return {
    acceptFromItemIds: [],
    acceptTimeShiftItemIds: [],
    acceptAddedItemIds: [],
    acceptRemovedItemIds: [],
  };
}

/** 1件の変更を受理するときの selection。 */
export function selectionForChange(change: DiffChangeRef): PartialAcceptSelection {
  const base = emptySelection();
  if (change.kind === "replace") return { ...base, acceptFromItemIds: [change.fromItemId] };
  if (change.kind === "time") return { ...base, acceptTimeShiftItemIds: [change.itemId] };
  if (change.kind === "add") return { ...base, acceptAddedItemIds: [change.itemId] };
  return { ...base, acceptRemovedItemIds: [change.itemId] };
}

export function changeExistsInDiff(diff: PlanDiff, change: DiffChangeRef): boolean {
  if (change.kind === "replace") {
    return diff.replaced.some(
      (row) => row.fromItemId === change.fromItemId && row.toItemId === change.toItemId,
    );
  }
  if (change.kind === "time") return diff.timeShifts.some((row) => row.itemId === change.itemId);
  if (change.kind === "add") return diff.addedItemIds.includes(change.itemId);
  return diff.removedItemIds.includes(change.itemId);
}

/**
 * UI の推定 kind と diff の実体がずれていても、残っている差分へ正規化する。
 * 見つからなければ null（すでに判断済み、または候補外）。
 */
export function resolveChangeInDiff(diff: PlanDiff, change: DiffChangeRef): DiffChangeRef | null {
  if (changeExistsInDiff(diff, change)) return change;

  if (change.kind === "time") {
    const byTo = diff.replaced.find((row) => row.toItemId === change.itemId);
    if (byTo) return { kind: "replace", fromItemId: byTo.fromItemId, toItemId: byTo.toItemId };
    if (change.fromItemId) {
      const byFrom = diff.replaced.find((row) => row.fromItemId === change.fromItemId);
      if (byFrom) return { kind: "replace", fromItemId: byFrom.fromItemId, toItemId: byFrom.toItemId };
    }
  }

  if (change.kind === "replace") {
    if (diff.timeShifts.some((row) => row.itemId === change.toItemId)) {
      return { kind: "time", itemId: change.toItemId, fromItemId: change.fromItemId };
    }
    const byFrom = diff.replaced.find((row) => row.fromItemId === change.fromItemId);
    if (byFrom) return { kind: "replace", fromItemId: byFrom.fromItemId, toItemId: byFrom.toItemId };
  }

  if (change.kind === "remove") {
    const byFrom = diff.replaced.find((row) => row.fromItemId === change.itemId);
    if (byFrom) return { kind: "replace", fromItemId: byFrom.fromItemId, toItemId: byFrom.toItemId };
  }

  return null;
}

export function stripChangeFromDiff(diff: PlanDiff, change: DiffChangeRef): PlanDiff {
  if (change.kind === "replace") {
    return {
      ...diff,
      replaced: diff.replaced.filter(
        (row) => !(row.fromItemId === change.fromItemId && row.toItemId === change.toItemId),
      ),
    };
  }
  if (change.kind === "time") {
    return { ...diff, timeShifts: diff.timeShifts.filter((row) => row.itemId !== change.itemId) };
  }
  if (change.kind === "add") {
    return { ...diff, addedItemIds: diff.addedItemIds.filter((id) => id !== change.itemId) };
  }
  return { ...diff, removedItemIds: diff.removedItemIds.filter((id) => id !== change.itemId) };
}

export function hasRemainingDiff(diff: PlanDiff): boolean {
  return (
    diff.replaced.length > 0 ||
    diff.addedItemIds.length > 0 ||
    diff.removedItemIds.length > 0 ||
    diff.timeShifts.length > 0
  );
}
