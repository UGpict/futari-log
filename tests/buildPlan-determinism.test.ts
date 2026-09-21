import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlan } from "../src/server/agent/buildPlan";
import type { Memory, PlanningInput, Spot } from "../src/domain/schemas";
import type { ProviderCtx } from "../src/server/providers";

/** This suite must not follow the shell's APP_RUNTIME (e.g. LIVE). */
process.env.APP_RUNTIME = "MOCK";

function fact<T>(value: T | null) {
  return { value, evidenceIds: [] as string[] };
}

function ctx(): ProviderCtx {
  return {
    runId: "run_det",
    overlays: [],
    cache: new Map(),
    httpAttempts: 0,
    onHttp: () => undefined,
  };
}

const input: PlanningInput = {
  dateTokyo: "2026-09-21",
  startTime: "13:00",
  endTime: "18:00",
  meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "meet" },
  end: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "meet" },
  budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
  preferences: [],
  fixedAppointments: [],
  autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
  travelMode: "WALK",
  areaName: "東京駅",
  areaLat: 35.681236,
  areaLng: 139.767125,
  radiusMeters: 2500,
};

const spots: Record<string, Spot> = {
  cafe: {
    id: "cafe",
    name: "丸の内カフェ",
    lat: 35.6815,
    lng: 139.764,
    categories: ["cafe"],
    environment: fact("INDOOR"),
    costForTwoJpy: fact({ min: 1000, max: 2000 }),
    restEase: fact("EASY"),
    standingBurden: fact("LOW"),
    officialUrl: null,
  },
  park: {
    id: "park",
    name: "近くの公園",
    lat: 35.682,
    lng: 139.76,
    categories: ["park"],
    environment: fact("OUTDOOR"),
    costForTwoJpy: fact({ min: 0, max: 0 }),
    restEase: fact("LIMITED"),
    standingBurden: fact("MEDIUM"),
    officialUrl: null,
  },
};

const restMemory: Memory = {
  id: "mem_rest",
  coupleId: "c",
  subject: "BOTH",
  type: "CARE",
  content: "座れる休憩を優先",
  sourceType: "SELF_REPORT",
  reflectionId: "r",
  reflectionVersion: 1,
  answerId: "a",
  evidenceQuote: "座れる休憩を優先",
  confirmation: "USER_CONFIRMED",
  approvedAt: "2026-09-21T00:00:00.000Z",
  visibility: "PRIVATE",
  strength: "SOFT",
  scope: "ONGOING",
  targetSessionId: null,
  planDirectives: [
    {
      kind: "PREFER_SEATED_REST",
      categories: [],
      spotId: null,
      maxStayMinutes: null,
      walkHardCapMinutes: null,
    },
  ],
  active: true,
  version: 1,
  supersedes: null,
};

/** 決定論性の比較用。id（newId）や evidence 時刻は除外する。 */
function deterministicSlice(plan: Awaited<ReturnType<typeof buildPlan>>["plan"]) {
  return {
    spotOrder: plan.items.map((item) => item.spotId),
    stays: plan.items.map((item) => ({
      spotId: item.spotId,
      startAt: item.startAt,
      endAt: item.endAt,
    })),
    travel: plan.legs.map((leg) => ({
      from: leg.from,
      to: leg.to,
      fromSpotId: leg.fromSpotId,
      toSpotId: leg.toSpotId,
      mode: leg.mode,
      durationMinutes: leg.durationMinutes.value,
      distanceMeters: leg.distanceMeters.value,
      departureAt: leg.departureAt,
    })),
  };
}

describe("buildPlan determinism", () => {
  it("returns identical spot order, stays, and travel for the same input (MOCK)", async () => {
    process.env.APP_RUNTIME = "MOCK";

    const args = {
      version: 1 as const,
      input,
      orderedSpotIds: ["park", "cafe"],
      spots,
      memories: [restMemory],
      dataMode: "LIVE" as const,
    };

    const first = await buildPlan({ ...args, ctx: ctx() });
    const second = await buildPlan({ ...args, ctx: ctx() });
    const third = await buildPlan({ ...args, ctx: ctx() });

    const a = deterministicSlice(first.plan);
    const b = deterministicSlice(second.plan);
    const c = deterministicSlice(third.plan);

    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
    assert.ok(a.spotOrder.length >= 1);
    assert.ok(a.stays.every((s) => s.startAt && s.endAt));
    assert.ok(a.travel.every((t) => t.durationMinutes != null));
  });
});
