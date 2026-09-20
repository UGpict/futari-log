import type {
  Plan,
  PlanItem,
  Spot,
  TravelLeg,
  ValidationIssue,
  ValidationResult,
  PlanningInput,
  Preference,
} from "@/domain/schemas";
export type PlanContext = {
  spots: Record<string, Spot>;
  input: PlanningInput;
};

function issue(
  code: string,
  severity: ValidationIssue["severity"],
  message: string,
  itemIds: string[] = [],
  evidenceIds: string[] = [],
): ValidationIssue {
  return { code, severity, message, itemIds, evidenceIds };
}

export function validatePlan(plan: Plan, ctx: PlanContext): ValidationResult {
  const issues: ValidationIssue[] = [];
  const items = plan.items;
  const spots = ctx.spots;
  const input = ctx.input;

  if (items.length < 1) {
    issues.push(issue("NO_ITEMS", "ERROR", "行程が空です"));
  }
  if (items.length > 4) {
    issues.push(
      issue(
        "TOO_MANY_ITEMS",
        "WARNING",
        "Day 1 の目安は 3〜4 件です",
        items.map((i) => i.id),
      ),
    );
  }

  const seenSpot = new Set<string>();
  for (const item of items) {
    const spot = spots[item.spotId];
    if (!spot) {
      issues.push(
        issue("UNKNOWN_SPOT", "ERROR", `未知の候補IDは採用できません: ${item.spotId}`, [
          item.id,
        ]),
      );
      continue;
    }
    if (seenSpot.has(item.spotId)) {
      issues.push(issue("DUPLICATE_SPOT", "ERROR", `${spot.name} が重複しています`, [item.id]));
    }
    seenSpot.add(item.spotId);
    if (new Date(item.endAt) <= new Date(item.startAt)) {
      issues.push(issue("TIME_ORDER", "ERROR", "終了が開始以前です", [item.id]));
    }
  }

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    if (new Date(curr.startAt) < new Date(prev.endAt)) {
      issues.push(
        issue("OVERLAP", "ERROR", "滞在時間が重なっています", [prev.id, curr.id]),
      );
    }
  }

  const legsByKey = new Map<string, TravelLeg>();
  for (const leg of plan.legs) {
    const key = `${leg.fromSpotId ?? "MEET"}->${leg.toSpotId ?? "END"}`;
    legsByKey.set(key, leg);
  }

  const meetToFirst = plan.legs.find((l) => l.from === "MEET");
  const lastToEnd = plan.legs.find((l) => l.to === "END");
  if (!meetToFirst) {
    issues.push(issue("MISSING_LEG_START", "ERROR", "集合から最初のスポットへの移動がありません"));
  }
  if (!lastToEnd) {
    issues.push(issue("MISSING_LEG_END", "ERROR", "最後のスポットから終了地点への移動がありません"));
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prevSpot = i === 0 ? null : items[i - 1].spotId;
    const from = i === 0 ? "MEET" : prevSpot;
    const leg =
      i === 0
        ? meetToFirst
        : plan.legs.find((l) => l.fromSpotId === from && l.toSpotId === item.spotId);
    if (!leg) {
      issues.push(
        issue("MISSING_LEG", "ERROR", "区間の移動が見つかりません", [item.id]),
      );
      continue;
    }
    const dur = leg.durationMinutes.value;
    const delay = leg.delayMinutesInjected ?? 0;
    if (dur == null) {
      issues.push(
        issue(
          "TRAVEL_UNKNOWN",
          "UNKNOWN",
          "移動時間が未検証です。直線距離では代用していません",
          [item.id],
          leg.evidenceIds,
        ),
      );
    } else {
      const arrive = new Date(leg.departureAt).getTime() + (dur + delay) * 60_000;
      if (arrive > new Date(item.startAt).getTime() + 60_000) {
        issues.push(
          issue("WAIT_OR_TRAVEL", "ERROR", "移動を含めると開始に間に合いません", [item.id], leg.evidenceIds),
        );
      }
    }
  }

  if (lastToEnd && items.length > 0) {
    const last = items[items.length - 1];
    const dur = lastToEnd.durationMinutes.value;
    const delay = lastToEnd.delayMinutesInjected ?? 0;
    const sessionEnd = tokyoEnd(input);
    if (dur == null) {
      issues.push(
        issue("END_TRAVEL_UNKNOWN", "UNKNOWN", "終了地点への移動時間が未検証です", [last.id]),
      );
    } else {
      const arriveEnd = new Date(last.endAt).getTime() + (dur + delay) * 60_000;
      if (arriveEnd > new Date(sessionEnd).getTime() + 60_000) {
        issues.push(
          issue("LATE_TO_END", "ERROR", "指定終了時刻までに終了地点へ着けません", [last.id]),
        );
      }
    }
  }

  for (const item of items) {
    const opening = plan.openings.find((o) => o.spotId === item.spotId);
    if (!opening) {
      issues.push(
        issue("OPENING_MISSING", "UNKNOWN", "営業時間が未検証です", [item.id]),
      );
    } else if (opening.state === "CLOSED") {
      issues.push(
        issue("CLOSED", "ERROR", "指定滞在時間帯は閉店です", [item.id], opening.evidenceIds),
      );
    } else if (opening.state === "UNKNOWN") {
      issues.push(
        issue("OPENING_UNKNOWN", "UNKNOWN", "営業時間が不明です", [item.id], opening.evidenceIds),
      );
    }
  }

  const costMaxes: number[] = [];
  let costUnknown = false;
  for (const item of items) {
    const spot = spots[item.spotId];
    if (!spot) continue;
    if (spot.costForTwoJpy.value == null) {
      costUnknown = true;
      issues.push(
        issue(
          "COST_UNKNOWN",
          "UNKNOWN",
          `${spot.name} の二人料金は不明です。予算内とは断定しません`,
          [item.id],
          spot.costForTwoJpy.evidenceIds,
        ),
      );
    } else {
      costMaxes.push(spot.costForTwoJpy.value.max);
    }
  }
  const budgetTotal =
    (input.budget.mealsJpy ?? 0) +
    (input.budget.facilitiesJpy ?? 0) +
    (input.budget.transitJpy ?? 0);
  const hasBudget =
    input.budget.mealsJpy != null ||
    input.budget.facilitiesJpy != null ||
    input.budget.transitJpy != null;
  if (hasBudget && !costUnknown && costMaxes.length > 0) {
    const sumMax = costMaxes.reduce((a, b) => a + b, 0);
    if (sumMax > budgetTotal && budgetTotal > 0) {
      issues.push(
        issue(
          "OVER_BUDGET",
          "ERROR",
          `料金上限の合計 ¥${sumMax} が予算 ¥${budgetTotal} を超えます`,
        ),
      );
    }
  }

  for (const appt of input.fixedAppointments) {
    const match = items.find((it) => {
      if (appt.spotId && it.spotId === appt.spotId) return true;
      const spot = spots[it.spotId];
      return Boolean(
        appt.spotNameHint && spot && spot.name.includes(appt.spotNameHint),
      );
    });
    if (!match) {
      issues.push(
        issue("FIXED_MISSING", "ERROR", `時刻固定の予定「${appt.label}」が行程にありません`),
      );
      continue;
    }
    if (!match.locked) {
      issues.push(
        issue("FIXED_UNLOCKED", "ERROR", "時刻固定の予定がロックされていません", [match.id]),
      );
    }
    if (
      match.startAt !== appt.startAt ||
      match.endAt !== appt.endAt
    ) {
      issues.push(
        issue("FIXED_MOVED", "ERROR", "時刻固定の予定の時間が変わっています", [match.id]),
      );
    }
  }

  const musts = input.preferences.filter((p) => p.priority === "MUST");
  for (const pref of musts) {
    const hit = items.some((it) => it.matchesPreferenceIds.includes(pref.id));
    if (!hit) {
      issues.push(
        issue("MUST_UNMET", "ERROR", `必須の希望が満たされていません: ${pref.content}`),
      );
    }
  }

  const errors = issues.filter((i) => i.severity === "ERROR");
  const unknowns = issues.filter((i) => i.severity === "UNKNOWN");
  const state: ValidationResult["state"] =
    errors.length > 0 ? "FAIL" : unknowns.length > 0 ? "CONDITIONAL" : "PASS";
  return { state, issues };
}

function tokyoEnd(input: PlanningInput): string {
  return `${input.dateTokyo}T${input.endTime}:00+09:00`;
}

export function preferenceMatchIds(spot: Spot, prefs: Preference[]): string[] {
  const ids: string[] = [];
  for (const pref of prefs) {
    const text = `${spot.name} ${spot.categories.join(" ")}`.toLowerCase();
    const c = pref.content;
    const walk = /散歩|歩く|散策|屋外/.test(c);
    const exhibit = /展示|美術館|博物館|科学館/.test(c);
    const sweet = /甘い|スイーツ|カフェ|デザート|ケーキ/.test(c);
    if (walk && (spot.categories.includes("park") || spot.environment.value === "OUTDOOR")) {
      ids.push(pref.id);
    } else if (
      exhibit &&
      (spot.categories.includes("art_gallery") ||
        spot.categories.includes("museum") ||
        /美術館|科学館/.test(spot.name))
    ) {
      ids.push(pref.id);
    } else if (
      sweet &&
      (spot.categories.includes("cafe") ||
        spot.categories.includes("bakery") ||
        /珈琲|カフェ|スイーツ/.test(spot.name))
    ) {
      ids.push(pref.id);
    } else if (text.includes(c.toLowerCase())) {
      ids.push(pref.id);
    }
  }
  return ids;
}

export function doneItemsPreserved(prev: PlanItem[], next: PlanItem[]): boolean {
  const nextBySpot = new Map(next.map((i) => [i.spotId, i]));
  for (const item of prev.filter((i) => i.progress === "DONE" || i.progress === "IN_PROGRESS")) {
    const found = nextBySpot.get(item.spotId);
    if (!found) return false;
    if (found.startAt !== item.startAt || found.endAt !== item.endAt) return false;
  }
  return true;
}
