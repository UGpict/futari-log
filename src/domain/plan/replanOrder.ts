export function isProtectedPlanItem(item: { locked: boolean; progress: string }): boolean {
  return item.locked || item.progress === "DONE" || item.progress === "IN_PROGRESS";
}

export function composeReplanOrder(input: {
  currentItems: Array<{ id: string; spotId: string; locked: boolean; progress: string }>;
  candidates: string[];
  targetPlanItemId?: string | null;
}): { orderedSpotIds: string[]; adjustmentReasons: string[]; targetChanged: boolean } {
  const held = new Set<string>();
  for (const item of input.currentItems) {
    if (isProtectedPlanItem(item)) held.add(item.spotId);
    else if (input.targetPlanItemId && item.id !== input.targetPlanItemId) held.add(item.spotId);
  }
  const unused = input.candidates.filter((id) => !held.has(id));
  let next = 0;
  const adjustmentReasons: string[] = [];
  let targetChanged = false;
  const orderedSpotIds = input.currentItems.map((item) => {
    if (isProtectedPlanItem(item)) return item.spotId;
    const shouldReplace = input.targetPlanItemId ? item.id === input.targetPlanItemId : true;
    if (!shouldReplace) return item.spotId;
    while (next < unused.length) {
      const candidate = unused[next++];
      if (candidate !== item.spotId) {
        adjustmentReasons.push(
          input.targetPlanItemId
            ? "指定した行程だけ差し替え。前後は必要な範囲だけ時刻と移動を再計算する"
            : "希望に合わせて未固定の行程を調整。固定・訪問中・完了済みは維持する",
        );
        if (!input.targetPlanItemId || item.id === input.targetPlanItemId) targetChanged = true;
        return candidate;
      }
    }
    return item.spotId;
  });
  return { orderedSpotIds, adjustmentReasons: [...new Set(adjustmentReasons)], targetChanged };
}

export function replanStartError(input: {
  kind: string;
  instruction?: string | null;
  basePlanVersion?: number | null;
  currentPlanVersion: number | null;
  targetPlanItemId?: string | null;
  currentItemIds?: string[] | null;
}): { status: number; error: string } | null {
  if (input.kind !== "REPLAN" || input.instruction == null) return null;
  if (!input.instruction.trim()) return { status: 400, error: "instruction required" };
  if (input.currentPlanVersion == null) return { status: 400, error: "no current plan" };
  if (input.basePlanVersion == null) return { status: 400, error: "basePlanVersion required" };
  if (input.basePlanVersion !== input.currentPlanVersion) return { status: 409, error: "stale version" };
  if (input.targetPlanItemId) {
    if (!input.currentItemIds) return { status: 400, error: "current plan missing" };
    if (!input.currentItemIds.includes(input.targetPlanItemId)) {
      return { status: 400, error: "targetPlanItemId not in current plan" };
    }
  }
  return null;
}
