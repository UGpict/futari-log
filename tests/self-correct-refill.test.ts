process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getCatalogSpot } from "../src/server/providers/catalog";
import type { ProviderCtx } from "../src/server/providers";
import { assessSpotOpening, asSpotOpeningHours } from "../src/server/providers/placeFacts";
import { toTokyoParts, tokyoDateTime, addMinutes } from "../src/lib/time";
import { refillOpenSpotIds, refillWithoutOpenCheck } from "../src/server/agent/selfCorrect";
import { buildPlan } from "../src/server/agent/buildPlan";
import type { PlanningInput, Spot } from "../src/domain/schemas";

const KIYOSUMI = { lat: 35.682163, lng: 139.798997 };
const DATE = "2026-09-21"; // 祝日の月曜

function ctx(): ProviderCtx {
  return {
    runId: "run_self_correct",
    overlays: [],
    cache: new Map(),
    httpAttempts: 0,
    placeHours: {},
    onHttp: () => undefined,
  };
}

function catalogAsSpot(id: string): Spot {
  const c = getCatalogSpot(id);
  assert.ok(c, id);
  const { hours: _h, datedHours: _d, types: _t, walkRestHint: _w, ...spot } = c;
  return spot;
}

describe("self-correct refill around Kiyosumi Monday", () => {
  const closedMuseum = "mock:kiyosumi-museum-closed";
  const closedMuseum2 = "mock:kiyosumi-museum-closed-2";
  const unknownCafe = "mock:kiyosumi-cafe-unknown";
  const openCafe = "mock:kiyosumi-cafe-open";

  const pool = [closedMuseum, closedMuseum2, unknownCafe, openCafe].map(catalogAsSpot);

  it("legacy refill re-adds a CLOSED museum (reproduces q_plan_unmet shape)", async () => {
    const ordered = [closedMuseum, unknownCafe];
    const closed = new Set([closedMuseum]);
    const legacy = refillWithoutOpenCheck({
      orderedSpotIds: ordered,
      closedSpotIds: closed,
      protectedSpotIds: new Set(),
      pool,
      rain: false,
      liveOnly: false,
      targetCount: 3,
    });
    // UNKNOWN cafe kept; next pool entry after filtering closed is closedMuseum2 (no open check).
    assert.deepEqual(legacy, [unknownCafe, closedMuseum2, openCafe].slice(0, 3));
    assert.ok(legacy.includes(closedMuseum2), "旧挙動は休館展示を無確認で補充する");

    const provider = ctx();
    for (const id of legacy) {
      const c = getCatalogSpot(id)!;
      provider.placeHours![id] = { regular: c.hours, dated: c.datedHours ?? {} };
    }
    const input: PlanningInput = {
      dateTokyo: DATE,
      startTime: "15:00",
      endTime: "21:00",
      meet: { name: "清澄白河駅", lat: KIYOSUMI.lat, lng: KIYOSUMI.lng, spotId: "meet" },
      end: { name: "清澄白河駅", lat: KIYOSUMI.lat, lng: KIYOSUMI.lng, spotId: "meet" },
      budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
      preferences: [],
      fixedAppointments: [],
      autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
      travelMode: "WALK",
      areaName: "清澄白河駅",
      areaLat: KIYOSUMI.lat,
      areaLng: KIYOSUMI.lng,
      radiusMeters: 2500,
    };
    const spots: Record<string, Spot> = Object.fromEntries(legacy.map((id) => [id, catalogAsSpot(id)]));
    const built = await buildPlan({
      version: 1,
      input,
      orderedSpotIds: legacy,
      spots,
      memories: [],
      ctx: provider,
      dataMode: "LIVE",
    });
    assert.equal(built.plan.validation.state, "FAIL");
    assert.ok(
      built.plan.validation.issues.some((i) => i.code === "CLOSED" || i.code === "OPENING_UNKNOWN"),
      JSON.stringify(built.plan.validation.issues),
    );
  });

  it("new refill keeps UNKNOWN and only adds OPEN-confirmed spots", async () => {
    const ordered = [closedMuseum, unknownCafe];
    const closed = new Set([closedMuseum]);
    const provider = ctx();
    const refill = await refillOpenSpotIds({
      orderedSpotIds: ordered,
      closedSpotIds: closed,
      protectedSpotIds: new Set(),
      pool,
      rain: false,
      liveOnly: false,
      targetCount: 3,
      maxLookups: 6,
      dateTokyo: DATE,
      startTime: "15:00",
      endTime: "21:00",
      ctx: provider,
    });
    assert.ok(refill.ids.includes(unknownCafe), "UNKNOWN は残す");
    assert.ok(!refill.ids.includes(closedMuseum), "CLOSED は除外");
    assert.ok(!refill.ids.includes(closedMuseum2), "休館展示は補充しない");
    assert.ok(refill.ids.includes(openCafe), "OPEN 確認できたカフェを補充");
    assert.ok(refill.lookups <= 6);

    const spots: Record<string, Spot> = Object.fromEntries(refill.ids.map((id) => [id, catalogAsSpot(id)]));
    const input: PlanningInput = {
      dateTokyo: DATE,
      startTime: "15:00",
      endTime: "21:00",
      meet: { name: "清澄白河駅", lat: KIYOSUMI.lat, lng: KIYOSUMI.lng, spotId: "meet" },
      end: { name: "清澄白河駅", lat: KIYOSUMI.lat, lng: KIYOSUMI.lng, spotId: "meet" },
      budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
      preferences: [],
      fixedAppointments: [],
      autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
      travelMode: "WALK",
      areaName: "清澄白河駅",
      areaLat: KIYOSUMI.lat,
      areaLng: KIYOSUMI.lng,
      radiusMeters: 2500,
    };
    const built = await buildPlan({
      version: 1,
      input,
      orderedSpotIds: refill.ids,
      spots,
      memories: [],
      ctx: provider,
      dataMode: "LIVE",
    });
    assert.notEqual(built.plan.validation.state, "FAIL");
    assert.ok(
      built.plan.validation.state === "CONDITIONAL" || built.plan.validation.state === "PASS",
      built.plan.validation.state,
    );
    assert.ok(
      !built.plan.validation.issues.some((i) => i.code === "CLOSED"),
      JSON.stringify(built.plan.validation.issues),
    );
  });

  it("uses visit window so 17:00 open is accepted for an 18:00 slot (not meet 15:00)", async () => {
    const lateOpenId = "mock:kiyosumi-cafe-open"; // fixture opens 11–22 including 18:00
    const earlyClosed = "mock:kiyosumi-museum-closed";
    const pool = [earlyClosed, lateOpenId].map(catalogAsSpot);
    const provider = ctx();
    const refill = await refillOpenSpotIds({
      orderedSpotIds: [earlyClosed],
      closedSpotIds: new Set([earlyClosed]),
      protectedSpotIds: new Set(),
      pool,
      rain: false,
      liveOnly: false,
      targetCount: 1,
      maxLookups: 6,
      dateTokyo: DATE,
      startTime: "15:00",
      endTime: "21:00",
      closedItemWindows: [
        {
          startAt: tokyoDateTime(DATE, "18:00"),
          endAt: tokyoDateTime(DATE, "18:50"),
        },
      ],
      ctx: provider,
    });
    assert.ok(refill.ids.includes(lateOpenId));

    // Same cafe would be CLOSED if wrongly probed at 15:00–15:50 against a 17:00-only shop.
    const eveningOnly = {
      regular: [{ days: [1], open: "17:00", close: "22:00" }],
      dated: {},
    };
    assert.equal(
      assessSpotOpening(
        eveningOnly,
        tokyoDateTime(DATE, "15:00"),
        addMinutes(tokyoDateTime(DATE, "15:00"), 50),
        toTokyoParts,
      ),
      "CLOSED",
    );
    assert.equal(
      assessSpotOpening(
        eveningOnly,
        tokyoDateTime(DATE, "18:00"),
        tokyoDateTime(DATE, "18:50"),
        toTokyoParts,
      ),
      "OPEN",
    );
  });

  it("fixture hours match assessSpotOpening expectations at Kiyosumi center", () => {
    const startAt = tokyoDateTime(DATE, "15:00");
    const endAt = addMinutes(startAt, 50);
    for (const [id, want] of [
      ["mock:kiyosumi-museum-holiday-open", "OPEN"],
      ["mock:kiyosumi-museum-closed", "CLOSED"],
      ["mock:kiyosumi-cafe-unknown", "UNKNOWN"],
      ["mock:kiyosumi-cafe-open", "OPEN"],
    ] as const) {
      const c = getCatalogSpot(id)!;
      const dist = Math.hypot(c.lat - KIYOSUMI.lat, c.lng - KIYOSUMI.lng);
      assert.ok(dist < 0.01, `${id} should be near Kiyosumi`);
      assert.equal(
        assessSpotOpening(asSpotOpeningHours({ regular: c.hours, dated: c.datedHours ?? {} }), startAt, endAt, toTokyoParts),
        want,
        id,
      );
    }
  });
});
