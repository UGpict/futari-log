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
        dataMode: "MOCK",
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
});
