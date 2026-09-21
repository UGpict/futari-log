import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComputeRoutesBody,
  classifyRoutesFailure,
  futureDepartureIso,
  parseDurationSeconds,
  waypointFromPoint,
} from "../src/server/providers/routes";
import { validatePlan } from "../src/domain/plan/validatePlan";
import type { Plan, PlanningInput, Spot } from "../src/domain/schemas";

describe("Routes request shape", () => {
  const from = { lat: 35.6813, lng: 139.76707, spotId: "ChIJmeet" };
  const to = { lat: 35.678, lng: 139.7705, spotId: "ChIJcafe" };

  it("omits departureTime for WALK", () => {
    const { body, departure } = buildComputeRoutesBody({
      from,
      to,
      mode: "WALK",
      departureAt: "2026-09-20T04:00:00.000Z",
    });
    assert.equal(body.travelMode, "WALK");
    assert.equal("departureTime" in body, false);
    assert.equal("routingPreference" in body, false);
    assert.deepEqual(body.origin, { placeId: "ChIJmeet" });
    assert.equal(departure, null);
  });

  it("uses traffic-aware departure for DRIVE and records a past-time correction", () => {
    const now = Date.parse("2026-09-20T08:00:00.000Z");
    const requested = "2026-09-20T04:00:00.000Z";
    const { body, departure } = buildComputeRoutesBody({
      from: { lat: 35.68, lng: 139.76 },
      to: { lat: 35.69, lng: 139.70 },
      mode: "DRIVE",
      departureAt: requested,
      nowMs: now,
    });
    assert.equal(body.travelMode, "DRIVE");
    assert.equal(body.routingPreference, "TRAFFIC_AWARE");
    assert.equal(body.departureTime, "2026-09-20T08:01:00.000Z");
    assert.equal(departure?.requestedDepartureAt, requested);
    assert.equal(departure?.effectiveDepartureAt, "2026-09-20T08:01:00.000Z");
    assert.equal(departure?.adjusted, true);
    assert.equal(departure?.reason, "PAST");
  });

  it("keeps a future planned DRIVE departure instead of now+60s", () => {
    const now = Date.parse("2026-09-20T08:00:00.000Z");
    const planned = "2026-09-20T10:00:00.000Z";
    const { body, departure } = buildComputeRoutesBody({
      from: { lat: 35.68, lng: 139.76 },
      to: { lat: 35.69, lng: 139.70 },
      mode: "DRIVE",
      departureAt: planned,
      nowMs: now,
    });
    assert.equal(body.departureTime, planned);
    assert.equal(departure?.requestedDepartureAt, planned);
    assert.equal(departure?.effectiveDepartureAt, planned);
    assert.equal(departure?.adjusted, false);
  });

  it("bumps a past departureTime for TRANSIT like DRIVE", () => {
    const now = Date.parse("2026-09-20T08:00:00.000Z");
    const { body, departure } = buildComputeRoutesBody({
      from: { lat: 35.68, lng: 139.76 },
      to: { lat: 35.69, lng: 139.70 },
      mode: "TRANSIT",
      departureAt: "2026-09-20T04:00:00.000Z",
      nowMs: now,
    });
    assert.equal(body.travelMode, "TRANSIT");
    assert.equal(body.departureTime, "2026-09-20T08:01:00.000Z");
    assert.equal(departure?.adjusted, true);
    assert.equal(departure?.reason, "PAST");
    assert.equal("routingPreference" in body, false);
  });
});

describe("Routes parsing", () => {
  it("parses duration strings and rejects junk", () => {
    assert.equal(parseDurationSeconds("842s"), 842);
    assert.equal(parseDurationSeconds("90.4s"), 90.4);
    assert.equal(parseDurationSeconds({ seconds: "12" }), 12);
    assert.equal(parseDurationSeconds("PT14M"), null);
    assert.equal(parseDurationSeconds(""), null);
  });

  it("classifies permission, quota, and invalid separately", () => {
    assert.equal(
      classifyRoutesFailure(403, { error: { status: "PERMISSION_DENIED", message: "Routes API has not been used in project 1 or it is disabled." } }).failure,
      "API_DISABLED",
    );
    assert.equal(classifyRoutesFailure(403, { error: { status: "PERMISSION_DENIED", message: "API key not allowed" } }).failure, "PERMISSION");
    assert.equal(classifyRoutesFailure(429, { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }).failure, "QUOTA");
    const invalid = classifyRoutesFailure(400, { error: { status: "INVALID_ARGUMENT", message: "Timestamp must be set to a future time." } });
    assert.equal(invalid.failure, "INVALID");
    assert.match(invalid.note, /不正リクエスト/);
    assert.match(invalid.note, /Timestamp must be set/);
    const server = classifyRoutesFailure(502, { error: { status: "UNAVAILABLE", message: "backend" } });
    assert.match(server.note, /不正レスポンス/);
  });

  it("does not use mock ids as Place ID", () => {
    assert.deepEqual(waypointFromPoint({ lat: 1, lng: 2, spotId: "mock:nagoya-station" }), {
      location: { latLng: { latitude: 1, longitude: 2 } },
    });
  });

  it("bumps a present-or-past timestamp at least 60s into the future", () => {
    const now = Date.parse("2026-09-20T08:55:49.308Z");
    assert.equal(futureDepartureIso("2026-09-20T08:55:49.308Z", now), "2026-09-20T08:56:49.308Z");
  });
});

describe("travel validation uses API minutes plus app buffer", () => {
  const input: PlanningInput = {
    dateTokyo: "2026-09-20",
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.68, lng: 139.76, spotId: "ChIJmeet" },
    end: { name: "新宿駅", lat: 35.69, lng: 139.70, spotId: "ChIJend" },
    budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
    preferences: [{ id: "p1", subject: "BOTH", content: "カフェ", priority: "PREFER", source: "SELF_REPORT" }],
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: "WALK",
    areaName: "東京駅",
    areaLat: 35.68,
    areaLng: 139.76,
    radiusMeters: 2500,
  };
  const spots: Record<string, Spot> = {
    cafe: {
      id: "cafe",
      name: "Cafe",
      lat: 35.678,
      lng: 139.77,
      categories: ["cafe"],
      environment: { value: "INDOOR", evidenceIds: [] },
      costForTwoJpy: { value: { min: 1000, max: 2000 }, evidenceIds: [] },
      restEase: { value: "EASY", evidenceIds: [] },
      standingBurden: { value: "LOW", evidenceIds: [] },
      officialUrl: null,
    },
  };

  function plan(startAt: string, bufferMinutes: number, cachedAt: string | null = null): Plan {
    return {
      version: 1,
      items: [
        {
          id: "it1",
          spotId: "cafe",
          startAt,
          endAt: "2026-09-20T05:00:00.000Z",
          progress: "NOT_STARTED",
          locked: false,
          lockReason: null,
          matchesPreferenceIds: ["p1"],
          memoryIds: [],
          reason: "カフェ",
          evidenceIds: [],
        },
      ],
      legs: [
        {
          id: "l1",
          from: "MEET",
          fromSpotId: "ChIJmeet",
          to: "SPOT",
          toSpotId: "cafe",
          mode: "WALK",
          departureAt: "2026-09-20T04:00:00.000Z",
          durationMinutes: { value: 10, evidenceIds: ["ev"] },
          distanceMeters: { value: 800, evidenceIds: ["ev"] },
          bufferMinutes,
          cachedAt,
          delayMinutesInjected: null,
          evidenceIds: ["ev"],
        },
        {
          id: "l2",
          from: "SPOT",
          fromSpotId: "cafe",
          to: "END",
          toSpotId: "ChIJend",
          mode: "WALK",
          departureAt: "2026-09-20T05:00:00.000Z",
          durationMinutes: { value: 12, evidenceIds: ["ev2"] },
          distanceMeters: { value: 900, evidenceIds: ["ev2"] },
          bufferMinutes: 5,
          cachedAt: null,
          delayMinutesInjected: null,
          evidenceIds: ["ev2"],
        },
      ],
      openings: [{ spotId: "cafe", startAt, endAt: "2026-09-20T05:00:00.000Z", state: "OPEN", evidenceIds: [] }],
      assumptions: [],
      validation: { state: "PASS", issues: [] },
      planB: [],
      costEstimate: {
        mealsJpy: { value: 2000, evidenceIds: [] },
        facilitiesJpy: { value: 0, evidenceIds: [] },
        transitJpy: { value: null, evidenceIds: [] },
        totalJpy: { value: 2000, evidenceIds: [] },
      },
      dataMode: "LIVE",
      memoryInfluences: [],
    };
  }

  it("fails when API duration plus buffer overruns the next start", () => {
    const result = validatePlan(plan("2026-09-20T04:10:00.000Z", 5), { spots, input });
    assert.ok(result.issues.some((i) => i.code === "WAIT_OR_TRAVEL"));
    assert.equal(result.state, "FAIL");
  });

  it("passes when the buffer fits, and reports cache as WARNING only", () => {
    const result = validatePlan(plan("2026-09-20T04:16:00.000Z", 5, "2026-09-20T08:00:00.000Z"), { spots, input });
    assert.equal(result.issues.some((i) => i.code === "WAIT_OR_TRAVEL"), false);
    assert.ok(result.issues.some((i) => i.code === "TRAVEL_CACHE" && i.severity === "WARNING"));
    assert.equal(result.state, "PASS");
  });
});
