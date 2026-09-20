import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePlan } from "../src/domain/plan/validatePlan";
import { evaluateAutoApply } from "../src/domain/plan/evaluateAutoApply";
import { diffPlan } from "../src/domain/plan/diffPlan";
import type { Plan, PlanningInput, Spot } from "../src/domain/schemas";

function fact<T>(value: T | null) {
  return { value, evidenceIds: [] as string[] };
}

const input: PlanningInput = {
  dateTokyo: "2026-09-19",
  startTime: "13:00",
  endTime: "18:00",
  meet: { name: "名古屋駅", lat: 35.17, lng: 136.88, spotId: "a" },
  end: { name: "名古屋駅", lat: 35.17, lng: 136.88, spotId: "a" },
  budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
  preferences: [
    {
      id: "p1",
      subject: "PARTNER",
      content: "甘いもの",
      priority: "MUST",
      source: "PARTNER_STATEMENT_REPORTED",
    },
  ],
  fixedAppointments: [],
  autoApply: { enabled: true, acknowledgedScope: "demo", validUntil: "2099-01-01T00:00:00.000Z" },
  travelMode: "WALK",
  areaName: "名古屋駅周辺",
  areaLat: 35.17,
  areaLng: 136.88,
  radiusMeters: 2500,
};

const spots: Record<string, Spot> = {
  cafe: {
    id: "cafe",
    name: "カフェ",
    lat: 35.17,
    lng: 136.88,
    categories: ["cafe"],
    environment: fact("INDOOR"),
    costForTwoJpy: fact({ min: 1000, max: 2000 }),
    restEase: fact("EASY"),
    standingBurden: fact("LOW"),
    officialUrl: "https://example.invalid/cafe",
  },
  park: {
    id: "park",
    name: "公園",
    lat: 35.18,
    lng: 136.89,
    categories: ["park"],
    environment: fact("OUTDOOR"),
    costForTwoJpy: fact({ min: 0, max: 0 }),
    restEase: fact("LIMITED"),
    standingBurden: fact("HIGH"),
    officialUrl: null,
  },
};

function basePlan(over: Partial<Plan> = {}): Plan {
  const plan: Plan = {
    version: 1,
    items: [
      {
        id: "i1",
        spotId: "cafe",
        startAt: "2026-09-19T04:20:00.000Z",
        endAt: "2026-09-19T05:10:00.000Z",
        progress: "NOT_STARTED",
        locked: false,
        lockReason: null,
        matchesPreferenceIds: ["p1"],
        memoryIds: [],
        reason: "甘いもの",
        evidenceIds: [],
      },
    ],
    legs: [
      {
        id: "l1",
        from: "MEET",
        fromSpotId: "a",
        to: "SPOT",
        toSpotId: "cafe",
        mode: "WALK",
        departureAt: "2026-09-19T04:00:00.000Z",
        durationMinutes: fact(15),
        distanceMeters: fact(800),
        delayMinutesInjected: null,
        evidenceIds: [],
      },
      {
        id: "l2",
        from: "SPOT",
        fromSpotId: "cafe",
        to: "END",
        toSpotId: "a",
        mode: "WALK",
        departureAt: "2026-09-19T05:10:00.000Z",
        durationMinutes: fact(10),
        distanceMeters: fact(500),
        delayMinutesInjected: null,
        evidenceIds: [],
      },
    ],
    openings: [
      {
        spotId: "cafe",
        startAt: "2026-09-19T04:20:00.000Z",
        endAt: "2026-09-19T05:10:00.000Z",
        state: "OPEN",
        evidenceIds: [],
      },
    ],
    assumptions: ["空席は確認していない（空席APIなし）"],
    validation: { state: "PASS", issues: [] },
    planB: [],
    costEstimate: {
      mealsJpy: fact(2000),
      facilitiesJpy: fact(0),
      transitJpy: fact(null),
      totalJpy: fact(2000),
    },
    dataMode: "LIVE",
    memoryInfluences: [],
    ...over,
  };
  plan.validation = validatePlan(plan, { spots, input });
  return plan;
}

describe("validatePlan", () => {
  it("unknown spot is FAIL", () => {
    const plan = basePlan();
    plan.items[0].spotId = "ghost";
    const result = validatePlan(plan, { spots, input });
    assert.equal(result.state, "FAIL");
    assert.ok(result.issues.some((i) => i.code === "UNKNOWN_SPOT"));
  });

  it("unknown cost is CONDITIONAL not PASS", () => {
    const localSpots = {
      ...spots,
      cafe: { ...spots.cafe, costForTwoJpy: fact<{ min: number; max: number }>(null) },
    };
    const plan = basePlan();
    const result = validatePlan(plan, { spots: localSpots, input });
    assert.equal(result.state, "CONDITIONAL");
    assert.ok(result.issues.some((i) => i.code === "COST_UNKNOWN"));
  });

  it("CLOSED is FAIL", () => {
    const plan = basePlan();
    plan.openings[0].state = "CLOSED";
    const result = validatePlan(plan, { spots, input });
    assert.equal(result.state, "FAIL");
  });
});

describe("evaluateAutoApply", () => {
  it("rejects CONDITIONAL and more than one replacement", () => {
    const previous = basePlan();
    const next = basePlan();
    next.version = 2;
    next.validation = { state: "CONDITIONAL", issues: [] };
    next.costEstimate.totalJpy = fact(2000);
    const diff = diffPlan(previous, next);
    const result = evaluateAutoApply({
      previous,
      next,
      diff,
      policy: input.autoApply,
      nowIso: "2026-09-19T00:00:00.000Z",
      expectedBaseVersion: 1,
    });
    assert.equal(result.apply, false);
  });

  it("allows a single cheaper replacement that stays PASS", () => {
    const previous = basePlan();
    previous.items.push({
      id: "i2",
      spotId: "park",
      startAt: "2026-09-19T05:30:00.000Z",
      endAt: "2026-09-19T06:10:00.000Z",
      progress: "NOT_STARTED",
      locked: false,
      lockReason: null,
      matchesPreferenceIds: [],
      memoryIds: [],
      reason: "散歩",
      evidenceIds: [],
    });
    previous.legs.splice(1, 0, {
      id: "lmid",
      from: "SPOT",
      fromSpotId: "cafe",
      to: "SPOT",
      toSpotId: "park",
      mode: "WALK",
      departureAt: previous.items[0].endAt,
      durationMinutes: fact(10),
      distanceMeters: fact(400),
      delayMinutesInjected: null,
      evidenceIds: [],
    });
    previous.legs[2].fromSpotId = "park";
    previous.validation = { state: "PASS", issues: [] };
    previous.costEstimate.totalJpy = fact(2000);

    const next = structuredClone(previous);
    next.version = 2;
    next.items[1] = {
      ...next.items[1],
      id: "i3",
      spotId: "cafe",
    };
    next.validation = { state: "PASS", issues: [] };
    next.costEstimate.totalJpy = fact(2000);
    const diff = {
      fromVersion: 1,
      toVersion: 2,
      keptItemIds: [previous.items[0].id],
      replaced: [
        {
          fromItemId: "i2",
          toItemId: "i3",
          fromSpotId: "park",
          toSpotId: "cafe",
        },
      ],
      addedItemIds: [],
      removedItemIds: [],
      timeShifts: [],
      summary: "1件を差し替え",
    };
    const result = evaluateAutoApply({
      previous,
      next,
      diff,
      policy: input.autoApply,
      nowIso: "2026-09-19T00:00:00.000Z",
      expectedBaseVersion: 1,
    });
    assert.equal(result.apply, true);
  });
});
