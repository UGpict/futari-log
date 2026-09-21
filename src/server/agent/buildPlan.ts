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
  TravelMode,
} from "@/domain/schemas";
import { WALK_LIMITS } from "@/config/settings";
import { explainWishMatches } from "@/contracts/spotKinds";
import {
  collectDirectiveEffects,
  stayMinutesForSpot,
} from "@/domain/memory/directives";
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
import { hydratePlacePhotos } from "@/server/providers/placePhotos";
import type { RouteEstimate } from "@/server/providers/routes";

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
  const effects = collectDirectiveEffects(input.memories);
  const restCare = effects.preferSeatedRest.length > 0;

  const detailsNeeded = input.orderedSpotIds.filter((id) => !spots[id]);
  for (const id of detailsNeeded.slice(0, 6)) {
    const d = await getSpotDetails(input.ctx, { spotId: id });
    evidence.push(...d.evidence);
    if (d.spot) spots[id] = d.spot;
  }

  const selected: Record<string, Spot> = {};
  for (const id of input.orderedSpotIds) {
    if (spots[id]) selected[id] = spots[id];
  }
  const photos = await hydratePlacePhotos(input.ctx, selected);
  Object.assign(spots, photos.spots);
  evidence.push(...photos.evidence);

  const locked = input.input.fixedAppointments.map((a) => {
    const spotId =
      a.spotId ??
      Object.values(spots).find((s) => a.spotNameHint && s.name.includes(a.spotNameHint))?.id ??
      input.orderedSpotIds.find((id) => getCatalogSpot(id)?.name.includes(a.label));
    return { ...a, spotId: spotId ?? a.spotId };
  });

  const lockedIds = locked.map((l) => l.spotId).filter((x): x is string => Boolean(x));
  let unlocked = uniqueIds(input.orderedSpotIds).filter(
    (id) => spots[id] && !lockedIds.includes(id),
  );
  if (effects.revisitSpotIds.size) {
    unlocked = [...unlocked].sort((a, b) => {
      const aRev = effects.revisitSpotIds.has(a) ? 0 : 1;
      const bRev = effects.revisitSpotIds.has(b) ? 0 : 1;
      return aRev - bRev;
    });
  }

  const items: PlanItem[] = [];
  const influences: Plan["memoryInfluences"] = [];
  const prevBySpot = new Map((input.previousItems ?? []).map((i) => [i.spotId, i]));

  function baseStay(spot: Spot): number {
    return stayMinutesForSpot(spot, effects, 50).stay;
  }

  function stayAndMemory(spot: Spot): { stay: number; memIds: string[] } {
    const { stay, influences: inf } = stayMinutesForSpot(spot, effects, 50);
    for (const row of inf) influences.push(row);
    return { stay, memIds: [...new Set(inf.map((i) => i.memoryId))] };
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
    if (effects.revisitSpotIds.has(spotId)) {
      for (const m of effects.revisitSpotIds.get(spotId) ?? []) {
        influences.push({
          memoryId: m.id,
          effect: "PRIORITY",
          detail: `${spot.name} を承認済みの再訪希望として優先`,
        });
        memIds.push(m.id);
      }
    }
    return {
      id: newId("it"),
      spotId,
      startAt,
      endAt,
      progress: "NOT_STARTED",
      locked: Boolean(appt),
      lockReason: appt ? "時刻固定" : null,
      matchesPreferenceIds: preferenceMatchIds(spot, input.input.preferences),
      memoryIds: [...new Set(memIds)],
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
      memoryId: effects.preferSeatedRest[0]?.id ?? "unknown",
      effect: "NONE",
      detail: "休憩候補は行程条件を既に満たすか、候補不足で追加していない",
    });
  }
  if (effects.preferSeatedRest.length && influences.length === 0) {
    influences.push({
      memoryId: effects.preferSeatedRest[0].id,
      effect: "NONE",
      detail: "既に条件を満たしているため変更なし",
    });
  }

  items.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const legs: TravelLeg[] = [];
  const meet = input.input.meet;
  const endPoint = input.input.end;
  const mode = input.input.travelMode;
  const travelNotes: string[] = [];

  function isProtected(item: PlanItem): boolean {
    return item.locked || item.progress === "DONE" || item.progress === "IN_PROGRESS";
  }

  function stayOf(item: PlanItem): number {
    const stay = minutesBetween(item.startAt, item.endAt);
    return stay > 0 && stay <= 80 ? stay : 50;
  }

  function blockMinutes(t: {
    durationMinutes: number | null;
    bufferMinutes?: number;
    delayMinutes: number;
  }): number | null {
    if (t.durationMinutes == null) return null;
    return t.durationMinutes + (t.bufferMinutes ?? 0) + t.delayMinutes;
  }

  async function measureLeg(
    from: { lat: number; lng: number; spotId: string | null; kind: TravelLeg["from"] },
    to: { lat: number; lng: number; spotId: string | null; kind: TravelLeg["to"] },
    departureAt: string,
  ): Promise<TravelLeg> {
    const label =
      from.kind === "MEET"
        ? `集合→${to.spotId ? spots[to.spotId]?.name ?? "最初" : "最初"}`
        : to.kind === "END"
          ? `${from.spotId ? spots[from.spotId]?.name ?? "最後" : "最後"}→解散`
          : `${from.spotId ? spots[from.spotId]?.name ?? "区間" : "区間"}→${to.spotId ? spots[to.spotId]?.name ?? "次" : "次"}`;

    const pointFrom = { lat: from.lat, lng: from.lng, spotId: from.spotId };
    const pointTo = { lat: to.lat, lng: to.lng, spotId: to.spotId };

    let adoptedMode: TravelMode = mode;
    let t: RouteEstimate & { delayMinutes: number };

    if (mode === "TRANSIT") {
      // 「公共交通を使う」= 徒歩＋公共交通。近距離は実WALK、長距離はTRANSIT。
      // 直線距離や固定分では代用しない。TRANSIT失敗時に長距離徒歩を無断採用しない。
      const walk = await estimateTravel(input.ctx, {
        from: pointFrom,
        to: pointTo,
        mode: "WALK",
        departureAt,
      });
      if (walk.durationMinutes != null && walk.durationMinutes <= WALK_LIMITS.legMinutes) {
        adoptedMode = "WALK";
        t = walk;
        travelNotes.push(`${label}: 徒歩 ${walk.durationMinutes}分（近距離のため徒歩を採用）`);
      } else {
        const transit = await estimateTravel(input.ctx, {
          from: pointFrom,
          to: pointTo,
          mode: "TRANSIT",
          departureAt,
        });
        adoptedMode = "TRANSIT";
        if (transit.durationMinutes != null) {
          t = transit;
          const walkHint =
            walk.durationMinutes != null
              ? `（徒歩なら ${walk.durationMinutes}分で上限超過のため公共交通）`
              : "";
          travelNotes.push(`${label}: 公共交通 ${transit.durationMinutes}分${walkHint}`);
        } else {
          t = transit;
          const walkHint =
            walk.durationMinutes != null
              ? `徒歩なら ${walk.durationMinutes}分だが上限超過のため公共交通を試した。長距離徒歩は採用しない。`
              : "徒歩経路も未取得。";
          travelNotes.push(`${label}: 未検証（${walkHint}${transit.evidence.note ?? "Routes 失敗"}）`);
          if (walk.durationMinutes != null) {
            // Keep walk evidence for diagnostics; transit is the authoritative failure.
            evidence.push(walk.evidence);
          }
        }
      }
    } else {
      t = await estimateTravel(input.ctx, {
        from: pointFrom,
        to: pointTo,
        mode,
        departureAt,
      });
      if (t.durationMinutes == null) {
        travelNotes.push(`${label}: 未検証（${t.evidence.note ?? "Routes 失敗"}）`);
      }
    }

    evidence.push(t.evidence);
    if (t.departureAdjusted && t.requestedDepartureAt && t.effectiveDepartureAt) {
      travelNotes.push(
        `${label}: 予定出発 ${t.requestedDepartureAt} → 実リクエスト ${t.effectiveDepartureAt}（過去・直近のみ補正。未来の予定は置き換えていない）`,
      );
    }
    return {
      id: newId("leg"),
      from: from.kind,
      fromSpotId: from.spotId,
      to: to.kind,
      toSpotId: to.spotId,
      mode: adoptedMode,
      departureAt,
      durationMinutes: fact(t.durationMinutes, [t.evidence.id]),
      distanceMeters: fact(t.distanceMeters, [t.evidence.id]),
      walkMinutesWithin:
        adoptedMode === "WALK"
          ? undefined
          : fact(t.walkMinutesWithin ?? null, [t.evidence.id]),
      bufferMinutes: t.bufferMinutes,
      cachedAt: t.cached ? t.evidence.fetchedAt : null,
      requestedDepartureAt: t.requestedDepartureAt,
      effectiveDepartureAt: t.effectiveDepartureAt,
      delayMinutesInjected: t.delayMinutes > 0 ? t.delayMinutes : null,
      evidenceIds: [t.evidence.id],
    };
  }

  if (items[0]) {
    const first = spots[items[0].spotId];
    let meetLeg = await measureLeg(
      { lat: meet.lat, lng: meet.lng, spotId: meet.spotId, kind: "MEET" },
      { lat: first.lat, lng: first.lng, spotId: first.id, kind: "SPOT" },
      start,
    );
    const travel = blockMinutes({
      durationMinutes: meetLeg.durationMinutes.value,
      bufferMinutes: meetLeg.bufferMinutes,
      delayMinutes: meetLeg.delayMinutesInjected ?? 0,
    });
    if (travel != null && !isProtected(items[0])) {
      const stay = stayOf(items[0]);
      items[0].startAt = addMinutes(start, travel);
      items[0].endAt = addMinutes(items[0].startAt, stay);
    }
    legs.push(meetLeg);
  }

  for (let i = 0; i < items.length - 1; i++) {
    const a = spots[items[i].spotId];
    const b = spots[items[i + 1].spotId];
    let departureAt = items[i].endAt;
    let leg = await measureLeg(
      { lat: a.lat, lng: a.lng, spotId: a.id, kind: "SPOT" },
      { lat: b.lat, lng: b.lng, spotId: b.id, kind: "SPOT" },
      departureAt,
    );
    const travel = blockMinutes({
      durationMinutes: leg.durationMinutes.value,
      bufferMinutes: leg.bufferMinutes,
      delayMinutes: leg.delayMinutesInjected ?? 0,
    });
    if (travel != null) {
      if (isProtected(items[i + 1])) {
        const mustEnd = addMinutes(items[i + 1].startAt, -travel);
        const minEnd = addMinutes(items[i].startAt, 25);
        if (!isProtected(items[i]) && new Date(items[i].endAt) > new Date(mustEnd) && new Date(mustEnd) >= new Date(minEnd)) {
          items[i].endAt = mustEnd;
        }
      } else {
        const startAt = addMinutes(items[i].endAt, travel);
        if (new Date(startAt) > new Date(items[i + 1].startAt)) {
          const stay = stayOf(items[i + 1]);
          items[i + 1].startAt = startAt;
          items[i + 1].endAt = addMinutes(startAt, stay);
        }
      }
    }
    if (mode === "TRANSIT" && items[i].endAt !== departureAt) {
      leg = await measureLeg(
        { lat: a.lat, lng: a.lng, spotId: a.id, kind: "SPOT" },
        { lat: b.lat, lng: b.lng, spotId: b.id, kind: "SPOT" },
        items[i].endAt,
      );
    } else {
      leg = { ...leg, departureAt: items[i].endAt };
    }
    legs.push(leg);
  }

  if (items.length) {
    const last = spots[items[items.length - 1].spotId];
    let endDeparture = items[items.length - 1].endAt;
    let endLeg = await measureLeg(
      { lat: last.lat, lng: last.lng, spotId: last.id, kind: "SPOT" },
      { lat: endPoint.lat, lng: endPoint.lng, spotId: endPoint.spotId, kind: "END" },
      endDeparture,
    );
    if (mode === "TRANSIT" && items[items.length - 1].endAt !== endDeparture) {
      endLeg = await measureLeg(
        { lat: last.lat, lng: last.lng, spotId: last.id, kind: "SPOT" },
        { lat: endPoint.lat, lng: endPoint.lng, spotId: endPoint.spotId, kind: "END" },
        items[items.length - 1].endAt,
      );
    }
    legs.push(endLeg);
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

  const assumptions: string[] = [...travelNotes];
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
  const notes = input.preferences.flatMap((pref) =>
    explainWishMatches(spot, pref.content)
      .filter((match) => match.confidence === "type")
      .map((match) => match.note),
  );
  const rest = input.preferences.some((pref) => /ゆっくり|休憩|のんびり/.test(pref.content));
  if (rest && spot.restEase.value === "EASY") {
    notes.push("休憩しやすい場所として記憶・希望を反映");
  }
  if (notes.length) return notes.join(" / ");
  return "集合からの移動を考慮して採用";
}
