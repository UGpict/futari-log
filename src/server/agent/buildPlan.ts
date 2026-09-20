import type {
  Evidence,
  Memory,
  OpeningAssessment,
  Plan,
  PlanB,
  PlanItem,
  PlanningInput,
  Spot,
  TravelLeg,
} from "@/domain/schemas";
import { preferenceMatchIds, validatePlan } from "@/domain/plan/validatePlan";
import { newId } from "@/lib/ids";
import { addMinutes, minutesBetween, tokyoDateTime } from "@/lib/time";
import {
  checkOpen,
  estimateTravel,
  getSpotDetails,
  type ProviderCtx,
} from "@/server/providers";
import { getCatalogSpot } from "@/server/providers/catalog";

function fact<T>(value: T | null, evidenceIds: string[] = []) {
  return { value, evidenceIds };
}

export type BuiltPlan = {
  plan: Plan;
  spots: Record<string, Spot>;
  evidence: Evidence[];
};

export async function buildPlan(input: {
  version: number;
  input: PlanningInput;
  orderedSpotIds: string[];
  spots: Record<string, Spot>;
  memories: Memory[];
  ctx: ProviderCtx;
  dataMode: Plan["dataMode"];
  previousItems?: PlanItem[];
}): Promise<BuiltPlan> {
  const evidence: Evidence[] = [];
  const spots = { ...input.spots };
  const start = tokyoDateTime(input.input.dateTokyo, input.input.startTime);
  const standingCare = input.memories.filter(
    (m) => m.active && /立|歩/.test(m.content) && m.strength !== undefined,
  );
  const restCare = standingCare.length > 0;

  const detailsNeeded = input.orderedSpotIds.filter((id) => !spots[id]);
  for (const id of detailsNeeded.slice(0, 6)) {
    const d = await getSpotDetails(input.ctx, { spotId: id });
    evidence.push(...d.evidence);
    if (d.spot) spots[id] = d.spot;
  }

  const locked = input.input.fixedAppointments.map((a) => {
    const spotId =
      a.spotId ??
      Object.values(spots).find((s) => a.spotNameHint && s.name.includes(a.spotNameHint))?.id ??
      input.orderedSpotIds.find((id) => getCatalogSpot(id)?.name.includes(a.label));
    return { ...a, spotId: spotId ?? a.spotId };
  });

  const lockedIds = locked.map((l) => l.spotId).filter((x): x is string => Boolean(x));
  const unlocked = uniqueIds(input.orderedSpotIds).filter(
    (id) => spots[id] && !lockedIds.includes(id),
  );

  const items: PlanItem[] = [];
  const influences: Plan["memoryInfluences"] = [];
  const prevBySpot = new Map((input.previousItems ?? []).map((i) => [i.spotId, i]));

  function baseStay(spot: Spot): number {
    if (restCare && (spot.standingBurden.value === "HIGH" || spot.standingBurden.value === "MEDIUM")) return 35;
    if (restCare && spot.restEase.value === "EASY") return 40;
    return 50;
  }

  function stayAndMemory(spot: Spot): { stay: number; memIds: string[] } {
    let stay = 50;
    const memIds: string[] = [];
    if (restCare && (spot.standingBurden.value === "HIGH" || spot.standingBurden.value === "MEDIUM")) {
      stay = 35;
      for (const m of standingCare) {
        memIds.push(m.id);
        influences.push({
          memoryId: m.id,
          effect: "DURATION",
          detail: `${spot.name} の滞在を短くした`,
        });
      }
    }
    if (restCare && spot.restEase.value === "EASY") {
      stay = 40;
      for (const m of standingCare) {
        memIds.push(m.id);
        influences.push({
          memoryId: m.id,
          effect: "REST_INSERT",
          detail: `${spot.name} を休憩として配置`,
        });
      }
    }
    return { stay, memIds: [...new Set(memIds)] };
  }

  function makeItem(
    spotId: string,
    startAt: string,
    endAt: string,
    appt: (typeof locked)[number] | undefined,
    prev?: PlanItem,
  ): PlanItem {
    if (prev && (prev.progress === "DONE" || prev.progress === "IN_PROGRESS" || prev.locked)) {
      return { ...prev };
    }
    const spot = spots[spotId];
    const { memIds } = stayAndMemory(spot);
    return {
      id: newId("it"),
      spotId,
      startAt,
      endAt,
      progress: "NOT_STARTED",
      locked: Boolean(appt),
      lockReason: appt ? "時刻固定" : null,
      matchesPreferenceIds: preferenceMatchIds(spot, input.input.preferences),
      memoryIds: memIds,
      reason: reasonFor(spot, input.input),
      evidenceIds: [...spot.environment.evidenceIds, ...spot.costForTwoJpy.evidenceIds],
    };
  }

  const lockItems = locked
    .filter((l) => l.spotId && spots[l.spotId])
    .map((appt) => makeItem(appt.spotId!, appt.startAt, appt.endAt, appt, prevBySpot.get(appt.spotId!)));
  lockItems.sort((a, b) => a.startAt.localeCompare(b.startAt));
  const firstLockStart = lockItems[0]?.startAt ?? addMinutes(start, 12 * 60);
  const lastLockEnd = lockItems.at(-1)?.endAt ?? start;

  const before: PlanItem[] = [];
  const after: PlanItem[] = [];
  let cursor = start;
  for (const spotId of unlocked) {
    const spot = spots[spotId];
    const prev = prevBySpot.get(spotId);
    const stay = baseStay(spot);
    const tentativeEnd = addMinutes(cursor, stay);
    const overlapsLock =
      lockItems.length > 0 &&
      new Date(addMinutes(tentativeEnd, 40)).getTime() > new Date(firstLockStart).getTime();
    if (overlapsLock) {
      after.push(makeItem(spotId, lastLockEnd, addMinutes(lastLockEnd, stay), undefined, prev));
    } else {
      const item = makeItem(spotId, cursor, tentativeEnd, undefined, prev);
      before.push(item);
      cursor = item.endAt;
    }
  }
  let afterCursor = lastLockEnd;
  for (const item of after) {
    if (item.locked || item.progress === "DONE" || item.progress === "IN_PROGRESS") continue;
    const stay = Math.max(25, minutesBetween(item.startAt, item.endAt) || 40);
    item.startAt = afterCursor;
    item.endAt = addMinutes(afterCursor, stay);
    afterCursor = item.endAt;
  }

  items.push(...before, ...lockItems, ...after);

  if (restCare && !items.some((it) => spots[it.spotId]?.restEase.value === "EASY")) {
    influences.push({
      memoryId: standingCare[0]?.id ?? "unknown",
      effect: "NONE",
      detail: "休憩候補は行程条件を既に満たすか、候補不足で追加していない",
    });
  }
  if (standingCare.length && influences.length === 0) {
    influences.push({
      memoryId: standingCare[0].id,
      effect: "NONE",
      detail: "既に条件を満たしているため変更なし",
    });
  }

  items.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const legs: TravelLeg[] = [];
  const meet = input.input.meet;
  const endPoint = input.input.end;
  const mode = input.input.travelMode;

  async function legBetween(
    from: { lat: number; lng: number; spotId: string | null; kind: TravelLeg["from"] },
    to: { lat: number; lng: number; spotId: string | null; kind: TravelLeg["to"] },
    departureAt: string,
  ): Promise<TravelLeg> {
    const t = await estimateTravel(input.ctx, {
      from,
      to,
      mode,
      departureAt,
    });
    evidence.push(t.evidence);
    return {
      id: newId("leg"),
      from: from.kind,
      fromSpotId: from.spotId,
      to: to.kind,
      toSpotId: to.spotId,
      mode,
      departureAt,
      durationMinutes: fact(t.durationMinutes, [t.evidence.id]),
      distanceMeters: fact(t.distanceMeters, [t.evidence.id]),
      delayMinutesInjected: t.delayMinutes > 0 ? t.delayMinutes : null,
      evidenceIds: [t.evidence.id],
    };
  }

  if (items[0]) {
    const first = spots[items[0].spotId];
    const meetLeg = await legBetween(
      { lat: meet.lat, lng: meet.lng, spotId: meet.spotId, kind: "MEET" },
      { lat: first.lat, lng: first.lng, spotId: first.id, kind: "SPOT" },
      start,
    );
    legs.push(meetLeg);
    const travel = (meetLeg.durationMinutes.value ?? 0) + (meetLeg.delayMinutesInjected ?? 0);
    if (!items[0].locked) {
      items[0].startAt = addMinutes(start, travel);
      const stay = minutesBetween(items[0].startAt, items[0].endAt);
      const originalStay = stay > 0 && stay <= 80 ? stay : 50;
      items[0].endAt = addMinutes(items[0].startAt, originalStay);
    }
  }

  for (let i = 0; i < items.length - 1; i++) {
    const a = spots[items[i].spotId];
    const b = spots[items[i + 1].spotId];
    const preview = await estimateTravel(input.ctx, {
      from: { lat: a.lat, lng: a.lng, spotId: a.id },
      to: { lat: b.lat, lng: b.lng, spotId: b.id },
      mode,
      departureAt: items[i].endAt,
    });
    const travel = (preview.durationMinutes ?? 0) + preview.delayMinutes;
    if (items[i + 1].locked) {
      const mustEnd = addMinutes(items[i + 1].startAt, -travel);
      const minEnd = addMinutes(items[i].startAt, 25);
      if (new Date(items[i].endAt) > new Date(mustEnd) && new Date(mustEnd) >= new Date(minEnd)) {
        items[i].endAt = mustEnd;
      }
    } else {
      const startAt = addMinutes(items[i].endAt, travel);
      if (new Date(startAt) > new Date(items[i + 1].startAt)) {
        const rawStay = minutesBetween(items[i + 1].startAt, items[i + 1].endAt);
        const stay = rawStay > 0 && rawStay <= 80 ? rawStay : 40;
        items[i + 1].startAt = startAt;
        items[i + 1].endAt = addMinutes(startAt, stay);
      }
    }
    legs.push(
      await legBetween(
        { lat: a.lat, lng: a.lng, spotId: a.id, kind: "SPOT" },
        { lat: b.lat, lng: b.lng, spotId: b.id, kind: "SPOT" },
        items[i].endAt,
      ),
    );
  }

  if (items.length) {
    const last = spots[items[items.length - 1].spotId];
    legs.push(
      await legBetween(
        { lat: last.lat, lng: last.lng, spotId: last.id, kind: "SPOT" },
        { lat: endPoint.lat, lng: endPoint.lng, spotId: endPoint.spotId, kind: "END" },
        items[items.length - 1].endAt,
      ),
    );
  }

  const openings: OpeningAssessment[] = [];
  for (const item of items) {
    const o = await checkOpen(input.ctx, {
      spotId: item.spotId,
      startAt: item.startAt,
      endAt: item.endAt,
    });
    openings.push(o);
    evidence.push({
      id: o.evidenceIds[0] ?? newId("ev"),
      kind: "API",
      provider: "mock-places",
      sourceRef: item.spotId,
      sourceField: "regularOpeningHours",
      fetchedAt: new Date().toISOString(),
      validFor: { from: item.startAt, to: item.endAt },
      note: "滞在時間帯全体に対する判定",
    });
  }

  const assumptions: string[] = [];
  for (const item of items) {
    const opening = openings.find((o) => o.spotId === item.spotId);
    if (opening?.state === "UNKNOWN") {
      assumptions.push(`${spots[item.spotId].name} の営業は未確認`);
    }
    if (spots[item.spotId].costForTwoJpy.value == null) {
      assumptions.push(`${spots[item.spotId].name} の料金は未確認`);
    }
  }
  assumptions.push("空席は確認していない（空席APIなし）");

  const planB: PlanB[] = [];
  for (const item of items) {
    const spot = spots[item.spotId];
    if (spot.environment.value === "OUTDOOR" && !item.locked) {
      const indoor = Object.values(spots).find(
        (s) => s.environment.value === "INDOOR" && !items.some((it) => it.spotId === s.id),
      );
      planB.push({
        id: newId("pb"),
        trigger: "雨・悪天候",
        itemId: item.id,
        candidateSpotId: indoor?.id ?? null,
        policy: indoor ? null : "発生時に近隣の屋内候補を検索",
        validation: indoor
          ? { state: "CONDITIONAL", issues: [] }
          : null,
        verifiedAt: indoor ? new Date().toISOString() : null,
        isVerifiedAlternative: Boolean(indoor),
      });
    }
  }

  let meals = 0;
  let facilities = 0;
  let mealsKnown = true;
  let facKnown = true;
  for (const item of items) {
    const cost = spots[item.spotId].costForTwoJpy.value;
    if (cost == null) {
      if (spots[item.spotId].categories.includes("cafe")) mealsKnown = false;
      else facKnown = false;
      continue;
    }
    if (spots[item.spotId].categories.includes("cafe") || spots[item.spotId].categories.includes("bakery")) {
      meals += cost.max;
    } else {
      facilities += cost.max;
    }
  }

  const draft: Plan = {
    version: input.version,
    items,
    legs,
    openings,
    assumptions,
    validation: { state: "PASS", issues: [] },
    planB,
    costEstimate: {
      mealsJpy: fact(mealsKnown ? meals : null),
      facilitiesJpy: fact(facKnown ? facilities : null),
      transitJpy: fact(null),
      totalJpy: fact(
        mealsKnown && facKnown ? meals + facilities : null,
      ),
    },
    dataMode: input.dataMode,
    memoryInfluences: uniqueInfluences(influences),
  };
  draft.validation = validatePlan(draft, { spots, input: input.input });
  return { plan: draft, spots, evidence };
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function uniqueInfluences(list: Plan["memoryInfluences"]): Plan["memoryInfluences"] {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = `${x.memoryId}:${x.effect}:${x.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function reasonFor(spot: Spot, input: PlanningInput): string {
  const matches = preferenceMatchIds(spot, input.preferences);
  if (matches.length) {
    const texts = input.preferences.filter((p) => matches.includes(p.id)).map((p) => p.content);
    return `希望「${texts.join(" / ")}」に合う実在スポット`;
  }
  return "動線と時間の都合で採用";
}
