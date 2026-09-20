import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calendarListResponseSchema } from "../src/contracts/calendar";
import { planningInputSchema } from "../src/contracts/planning";
import { searchCatalogByName } from "../src/server/providers/catalog";
import { scoutJobsForPreferences } from "../src/server/agent/scoutJobs";
import { evaluateWalkLimits, walkAckFingerprint, walkLongAckMatches, walkLongAcknowledged } from "../src/domain/plan/walkLimits";
import { WALK_LIMITS } from "../src/config/settings";

describe("calendar contract", () => {
  it("marks an empty month as empty, not as demo plans", () => {
    const parsed = calendarListResponseSchema.parse({
      plans: [],
      from: "2026-09-01",
      to: "2026-09-30",
      state: "empty",
      draftPolicy: "listed_when_plan_exists",
    });
    assert.equal(parsed.plans.length, 0);
    assert.equal(parsed.state, "empty");
  });
});

describe("place search", () => {
  it("returns mock catalog hits without substituting demo coordinates", () => {
    const hit = searchCatalogByName("名古屋駅").find((p) => p.id === "mock:nagoya-station");
    assert.ok(hit);
    assert.equal(hit?.lat, 35.170915);
    assert.equal(hit?.lng, 136.881537);
  });
});

describe("scout jobs from wishes", () => {
  it("maps aquarium and cafe chips to search types", () => {
    const mapped = scoutJobsForPreferences([
      { content: "遊びや体験を楽しむデート。気になること：水族館、カフェ" },
    ]);
    assert.ok(mapped.jobs.some((j) => j.includedTypes.includes("aquarium")));
    assert.ok(mapped.jobs.some((j) => j.includedTypes.includes("cafe")));
    assert.equal(mapped.unsupported.length, 0);
  });

  it("keeps ものづくり体験 as unsupported instead of inventing a type", () => {
    const mapped = scoutJobsForPreferences([{ content: "ものづくり体験をしたい" }]);
    assert.deepEqual(mapped.unsupported, ["ものづくり体験"]);
  });
});

describe("create session input", () => {
  const planFormBody = {
    dateTokyo: "2026-09-20",
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs" },
    end: { name: "新宿駅", lat: 35.690921, lng: 139.700258, spotId: "ChIJ5aHh9wqNGGARKfwN1ZCK_3w" },
    budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
    preferences: [
      {
        id: "pref_self",
        subject: "SELF",
        content: "のんびり過ごすデート。気になること：カフェ",
        priority: "PREFER",
        source: "SELF_REPORT",
      },
    ],
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: "WALK",
    areaName: "東京駅",
    areaLat: 35.681236,
    areaLng: 139.767125,
    radiusMeters: 2500,
  };

  it("accepts the plan-form payload without loosening fields", () => {
    const parsed = planningInputSchema.safeParse(planFormBody);
    assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
  });

  it("still rejects missing meet coordinates", () => {
    const parsed = planningInputSchema.safeParse({
      ...planFormBody,
      meet: { name: "東京駅", spotId: "ChIJmeet" },
    });
    assert.equal(parsed.success, false);
  });
});

describe("walk limits", () => {
  const leg = (minutes: number | null) => ({
    mode: "WALK" as const,
    durationMinutes: { value: minutes, evidenceIds: [] },
  });

  it("flags a long last-to-end walk without changing the mode", () => {
    const result = evaluateWalkLimits("WALK", [leg(8), leg(12), leg(103)]);
    assert.equal(result.exceeds, true);
    assert.equal(result.overLeg, true);
    assert.equal(result.longestLegMinutes, 103);
    assert.ok(result.longestLegMinutes > WALK_LIMITS.legMinutes);
    assert.equal(evaluateWalkLimits("TRANSIT", [leg(103)]).exceeds, false);
  });

  it("scopes long-walk consent to a session itinerary fingerprint", () => {
    const fingerprint = walkAckFingerprint({
      dateTokyo: "2026-09-20",
      travelMode: "WALK",
      meetSpotId: "meet",
      endSpotId: "end",
      spotIds: ["a", "b"],
      longestLegMinutes: 103,
      totalMinutes: 108,
    });
    const ack = { fingerprint, at: "2026-09-20T00:00:00.000Z" };
    assert.equal(walkLongAckMatches(ack, fingerprint), true);
    assert.equal(
      walkLongAckMatches(
        ack,
        walkAckFingerprint({
          dateTokyo: "2026-09-20",
          travelMode: "WALK",
          meetSpotId: "meet",
          endSpotId: "end",
          spotIds: ["a", "b"],
          longestLegMinutes: 90,
          totalMinutes: 95,
        }),
      ),
      true,
    );
    assert.equal(
      walkLongAckMatches(
        ack,
        walkAckFingerprint({
          dateTokyo: "2026-09-20",
          travelMode: "WALK",
          meetSpotId: "meet",
          endSpotId: "end",
          spotIds: ["a", "c"],
          longestLegMinutes: 130,
          totalMinutes: 150,
        }),
      ),
      false,
    );
    assert.equal(
      walkLongAckMatches(
        ack,
        walkAckFingerprint({
          dateTokyo: "2026-09-20",
          travelMode: "WALK",
          meetSpotId: "meet",
          endSpotId: "other-end",
          spotIds: ["a", "b"],
          longestLegMinutes: 103,
          totalMinutes: 108,
        }),
      ),
      false,
    );
    assert.equal(walkLongAcknowledged({ walkLongAcknowledged: true }), false);
    assert.equal(walkLongAcknowledged({}), false);
  });
});

