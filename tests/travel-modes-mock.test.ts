process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlan } from "../src/server/agent/buildPlan";
import type { PlanningInput, Spot } from "../src/domain/schemas";
import type { ProviderCtx } from "../src/server/providers";
import { evaluateWalkLimits } from "../src/domain/plan/walkLimits";
import { WALK_LIMITS } from "../src/config/settings";

function fact<T>(value: T | null) {
  return { value, evidenceIds: [] as string[] };
}

function ctx(): ProviderCtx {
  return {
    runId: "run_modes",
    overlays: [],
    cache: new Map(),
    httpAttempts: 0,
    onHttp: () => undefined,
  };
}

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

function baseInput(mode: PlanningInput["travelMode"]): PlanningInput {
  return {
    dateTokyo: "2026-09-21",
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "meet" },
    end: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "meet" },
    budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
    preferences: [
      {
        id: "p",
        subject: "SELF",
        content: "カフェでゆっくり",
        priority: "PREFER",
        source: "SELF_REPORT",
      },
    ],
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: mode,
    areaName: "東京駅",
    areaLat: 35.681236,
    areaLng: 139.767125,
    radiusMeters: 2500,
  };
}

describe("MOCK travel modes", () => {
  for (const mode of ["WALK", "TRANSIT", "DRIVE"] as const) {
    it(`builds a plan for ${mode}`, async () => {
      const built = await buildPlan({
        version: 1,
        ctx: ctx(),
        input: baseInput(mode),
        orderedSpotIds: ["park", "cafe"],
        spots,
        memories: [],
        dataMode: "LIVE",
      });
      assert.ok(built.plan.items.length >= 1, `${mode} should place spots`);
      assert.ok(built.plan.legs.length >= 1, `${mode} should have legs`);
      const walkCheck = evaluateWalkLimits(mode, built.plan.legs, {
        hardTotalMinutes: WALK_LIMITS.hardTotalMinutes,
        enforcePerLeg: mode === "WALK",
      });
      if (mode !== "WALK") {
        assert.equal(
          walkCheck.exceeds,
          false,
          `${mode} must not trip q_long_walk via per-leg WALK rules`,
        );
      }
    });
  }

  it("does not fail when meet, locked venue, and end are the same place", async () => {
    const office: Spot = {
      id: "demo:tomoshibi-surugadai",
      name: "燈株式会社オフィス",
      lat: 35.69955,
      lng: 139.76405,
      categories: ["point_of_interest"],
      environment: fact("INDOOR"),
      costForTwoJpy: fact({ min: 0, max: 0 }),
      restEase: fact("EASY"),
      standingBurden: fact("MEDIUM"),
      officialUrl: null,
    };
    const input = baseInput("WALK");
    input.dateTokyo = "2026-09-21";
    input.startTime = "10:00";
    input.endTime = "21:00";
    input.meet = {
      name: office.name,
      lat: office.lat,
      lng: office.lng,
      spotId: office.id,
      address: "東京都千代田区神田駿河台4丁目6",
    };
    input.end = { ...input.meet };
    input.fixedAppointments = [
      {
        id: "fix_hack",
        label: "AI HACK 2026",
        spotId: office.id,
        spotNameHint: "AI HACK 2026",
        startAt: "2026-09-21T10:00:00+09:00",
        endAt: "2026-09-21T16:00:00+09:00",
        kind: "TIME_FIXED",
      },
    ];
    input.preferences = [
      {
        id: "p",
        subject: "SELF",
        content: "神田駿河台の会場で日中のハッカソンのあと、17時ごろから近くの飲み屋で乾杯したい",
        priority: "PREFER",
        source: "SELF_REPORT",
      },
    ];
    const built = await buildPlan({
      version: 1,
      ctx: ctx(),
      input,
      orderedSpotIds: [office.id],
      spots: { [office.id]: office },
      memories: [],
      dataMode: "LIVE",
    });
    assert.equal(built.plan.validation.state, "PASS", JSON.stringify(built.plan.validation.issues));
    assert.equal(built.plan.items.length, 1);
    assert.equal(built.plan.items[0]?.locked, true);
    const meetLeg = built.plan.legs.find((leg) => leg.from === "MEET");
    assert.equal(meetLeg?.durationMinutes.value, 0);
    assert.equal(meetLeg?.bufferMinutes ?? 0, 0);
  });
});
