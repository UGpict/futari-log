import { spotMatchesWish } from "@/contracts/spotKinds";
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
import { toTokyoParts } from "@/lib/time";
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
    const buffer = leg.bufferMinutes ?? 0;
    if (leg.cachedAt) {
      issues.push(
        issue(
          "TRAVEL_CACHE",
          "WARNING",
          `移動時間はキャッシュ（取得 ${leg.cachedAt}）を使っています`,
          [item.id],
          leg.evidenceIds,
        ),
      );
    }
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
      const arrive = new Date(leg.departureAt).getTime() + (dur + buffer + delay) * 60_000;
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
    const buffer = lastToEnd.bufferMinutes ?? 0;
    const sessionEnd = tokyoEnd(input);
    if (lastToEnd.cachedAt) {
      issues.push(
        issue(
          "TRAVEL_CACHE",
          "WARNING",
          `終了地点への移動時間はキャッシュ（取得 ${lastToEnd.cachedAt}）を使っています`,
          [last.id],
          lastToEnd.evidenceIds,
        ),
      );
    }
    if (dur == null) {
      issues.push(
        issue("END_TRAVEL_UNKNOWN", "UNKNOWN", "終了地点への移動時間が未検証です", [last.id], lastToEnd.evidenceIds),
      );
    } else {
      const arriveEnd = new Date(last.endAt).getTime() + (dur + buffer + delay) * 60_000;
      if (arriveEnd > new Date(sessionEnd).getTime() + 60_000) {
        issues.push(
          issue("LATE_TO_END", "ERROR", "指定終了時刻までに終了地点へ着けません", [last.id]),
        );
      }
    }
  }

  for (const item of items) {
    const spot = spots[item.spotId];
    const opening = plan.openings.find((o) => o.spotId === item.spotId);
    if (spot?.spotKind === "EVENT") {
      const window = spot.eventWindow;
      if (!window || window.confirmation !== "VERIFIED" || !window.startAt || !window.endAt) {
        issues.push(issue("EVENT_UNKNOWN", "UNKNOWN", "開催期間が未検証のため確定できません", [item.id]));
      } else {
        const stayStart = new Date(item.startAt).getTime();
        const stayEnd = new Date(item.endAt).getTime();
        if (stayEnd < new Date(window.startAt).getTime() || stayStart > new Date(window.endAt).getTime()) {
          issues.push(issue("EVENT_OUTSIDE", "ERROR", "滞在が開催期間の外です", [item.id], window.evidenceIds));
        }
      }
      const parts = toTokyoParts(item.startAt);
      const closed = spot.eventClosed;
      if (!closed || closed.confirmation !== "VERIFIED") {
        issues.push(issue("EVENT_CLOSED_UNKNOWN", "UNKNOWN", "休館日が未検証のため採用しません", [item.id]));
      } else if (isClosedOn(closed, parts.date, parts.weekday)) {
        issues.push(issue("EVENT_CLOSED", "ERROR", "その日は休館です", [item.id], closed.evidenceIds));
      }
      const hours = spot.eventHours;
      if (!hours || hours.confirmation !== "VERIFIED" || !hours.open || !hours.close) {
        issues.push(issue("EVENT_HOURS_UNKNOWN", "UNKNOWN", "開催時間が未検証のため採用しません", [item.id]));
      } else {
        const close = parts.weekday === 5 && hours.fridayClose ? hours.fridayClose : hours.close;
        const stayStartMin = parts.hour * 60 + parts.minute;
        const endParts = toTokyoParts(item.endAt);
        const stayEndMin = endParts.hour * 60 + endParts.minute;
        const openMin = hmToMin(hours.open);
        const closeMin = hmToMin(close);
        if (stayStartMin < openMin || stayEndMin > closeMin) {
          issues.push(issue("EVENT_HOURS_OUTSIDE", "ERROR", "滞在が開催時間の外です", [item.id], hours.evidenceIds));
        }
      }
      continue;
    }
    if (!opening) {
      issues.push(issue("OPENING_MISSING", "UNKNOWN", "営業時間が未検証です", [item.id]));
    } else if (opening.state === "CLOSED") {
      issues.push(issue("CLOSED", "ERROR", "指定滞在時間帯は閉店です", [item.id], opening.evidenceIds));
    } else if (opening.state === "UNKNOWN") {
      issues.push(issue("OPENING_UNKNOWN", "UNKNOWN", "施設の営業時間が不明です", [item.id], opening.evidenceIds));
    }
  }

  const costMaxes: number[] = [];
  let costUnknown = false;
  let knownSubtotal = 0;
  let hasKnownPartial = false;
  const costUnknownNames: string[] = [];
  const costUnknownItemIds: string[] = [];
  const costUnknownEvidenceIds: string[] = [];
  for (const item of items) {
    const spot = spots[item.spotId];
    if (!spot) continue;
    const accounting = spot.costAccounting;
    const ceiling =
      accounting && accounting.amountMaxJpy != null && accounting.maxInclusive
        ? accounting.amountMaxJpy
        : spot.costForTwoJpy.value?.max ?? null;
    // 下限のみ・maxInclusive=false は予算上限に使わない。
    if (ceiling == null) {
      costUnknown = true;
      costUnknownNames.push(spot.name);
      costUnknownItemIds.push(item.id);
      costUnknownEvidenceIds.push(...spot.costForTwoJpy.evidenceIds);
      if (accounting?.knownSubtotalJpy != null) {
        knownSubtotal += accounting.knownSubtotalJpy;
        hasKnownPartial = true;
      }
    } else {
      costMaxes.push(ceiling);
      if (accounting?.status === "ESTIMATED") {
        issues.push(
          issue(
            "COST_ESTIMATED",
            "WARNING",
            `${spot.name} は概算（${accounting.assumptionLabel ?? "仮定あり"}）。上限保証ではありません`,
            [item.id],
            spot.costForTwoJpy.evidenceIds,
          ),
        );
      }
    }
  }
  if (costUnknownNames.length) {
    issues.push(
      issue(
        "COST_UNKNOWN",
        "UNKNOWN",
        `料金を確認できなかったお店：${costUnknownNames.join("、")}`,
        costUnknownItemIds,
        [...new Set(costUnknownEvidenceIds)],
      ),
    );
  }
  const budgetTotal =
    (input.budget.mealsJpy ?? 0) +
    (input.budget.facilitiesJpy ?? 0) +
    (input.budget.transitJpy ?? 0);
  const hasBudget =
    input.budget.mealsJpy != null ||
    input.budget.facilitiesJpy != null ||
    input.budget.transitJpy != null;
  if (hasBudget && budgetTotal > 0) {
    const sumMax = costMaxes.reduce((a, b) => a + b, 0);
    // 判明分だけで超過していれば、不明があっても見逃さない。
    const partialOver = hasKnownPartial && knownSubtotal > budgetTotal;
    if ((!costUnknown && costMaxes.length > 0 && sumMax > budgetTotal) || partialOver) {
      issues.push(
        issue(
          "OVER_BUDGET",
          "ERROR",
          partialOver && costUnknown
            ? `判明分の小計 ¥${knownSubtotal} がすでに予算 ¥${budgetTotal} を超えます（未確認項目あり）`
            : `料金上限の合計 ¥${sumMax} が予算 ¥${budgetTotal} を超えます`,
        ),
      );
    } else if (!costUnknown && costMaxes.length > 0 && sumMax <= budgetTotal) {
      const anyEstimated = items.some((it) => spots[it.spotId]?.costAccounting?.status === "ESTIMATED");
      if (anyEstimated) {
        issues.push(
          issue(
            "BUDGET_OK_ESTIMATED",
            "WARNING",
            `概算では予算内（合計上限 ¥${sumMax} ≤ ¥${budgetTotal}）。必ず予算内とは限りません`,
          ),
        );
      }
    }
  }
  if (input.budget.transitJpy == null && hasBudget) {
    issues.push(
      issue("TRANSIT_COST_EXCLUDED", "WARNING", "交通費が未設定のため、総額には交通費が含まれていません"),
    );
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

/** ERROR / UNKNOWN block plan confidence; WARNING alone does not. */
export function isConstraintIssue(issue: Pick<ValidationIssue, "severity">): boolean {
  return issue.severity === "ERROR" || issue.severity === "UNKNOWN";
}

/** True when validation fails or any constraint-severity issue is present. */
export function hasConstraintViolation(
  validation: Pick<ValidationResult, "state" | "issues"> | null | undefined,
): boolean {
  if (!validation) return false;
  if (validation.state === "FAIL") return true;
  return validation.issues.some(isConstraintIssue);
}

function tokyoEnd(input: PlanningInput): string {
  return `${input.dateTokyo}T${input.endTime}:00+09:00`;
}

export function preferenceMatchIds(spot: Spot, prefs: Preference[]): string[] {
  return prefs.filter((pref) => spotMatchesWish(spot, pref.content)).map((pref) => pref.id);
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

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function isClosedOn(
  rule: { weekdays: number[]; exceptionOpen: string[]; extraClosed: string[] },
  dateTokyo: string,
  weekday: number,
): boolean {
  if (rule.exceptionOpen.includes(dateTokyo)) return false;
  if (rule.extraClosed.includes(dateTokyo)) return true;
  return rule.weekdays.includes(weekday);
}
