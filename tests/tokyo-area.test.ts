import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SEARCH_EXPAND,
  areaPointFromFixedNameHint,
  assessTokyoPoint,
  assessTokyoPlan,
  companionScoutJobs,
  searchRadiiFor,
  wantsSameKindTour,
} from "../src/contracts/serviceArea";
import { scoutJobsFromWishes } from "../src/contracts/spotKinds";
import { pickFromCandidates } from "../src/server/agent/planner";
import { jobsMissingCoverage } from "../src/server/agent/scout";

function spot(id: string, categories: string[], name = id) {
  return {
    id,
    name,
    lat: 35.68,
    lng: 139.76,
    categories,
    environment: { value: "INDOOR" as const, evidenceIds: [] as string[] },
    costForTwoJpy: { value: { min: 1000, max: 2000 }, evidenceIds: [] as string[] },
    restEase: { value: "EASY" as const, evidenceIds: [] as string[] },
    standingBurden: { value: "LOW" as const, evidenceIds: [] as string[] },
    officialUrl: null,
  };
}

describe("tokyo service area", () => {
  it("keeps Tokyo station inside and Nagoya outside without substituting coordinates", () => {
    const tokyo = assessTokyoPoint({
      name: "東京駅",
      lat: 35.681236,
      lng: 139.767125,
      address: "東京都千代田区",
    });
    const nagoya = assessTokyoPoint({
      name: "名古屋駅",
      lat: 35.170915,
      lng: 136.881537,
      address: "愛知県名古屋市",
    });
    assert.equal(tokyo, "inside");
    assert.equal(nagoya, "outside");
    const plan = assessTokyoPlan([
      { name: "名古屋駅", lat: 35.170915, lng: 136.881537, address: "愛知県名古屋市" },
    ]);
    assert.equal(plan.verdict, "outside");
    assert.equal(plan.outside[0]?.lat, 35.170915);
  });

  it("asks when the location cannot be judged", () => {
    assert.equal(assessTokyoPoint({ name: "集合場所", lat: Number.NaN, lng: Number.NaN }), "unknown");
  });

  it("does not treat event-style fixed labels without geo as tokyo-unknown", () => {
    assert.equal(areaPointFromFixedNameHint("AI HACK 2026"), null);
    assert.equal(areaPointFromFixedNameHint("集合場所"), null);
    const aichi = areaPointFromFixedNameHint("愛知県美術館");
    assert.ok(aichi);
    assert.equal(assessTokyoPoint(aichi), "outside");
  });

  it("treats Tomoshibi demo venue coords as inside Tokyo", () => {
    assert.equal(
      assessTokyoPoint({
        name: "燈株式会社オフィス",
        lat: 35.69955,
        lng: 139.76405,
        address: "〒101-0062 東京都千代田区神田駿河台4丁目6 21階",
      }),
      "inside",
    );
  });

  it("expands walk radii from settings and stops when acknowledged", () => {
    assert.deepEqual(searchRadiiFor("WALK"), [
      SEARCH_EXPAND.WALK.initialMeters,
      SEARCH_EXPAND.WALK.initialMeters + SEARCH_EXPAND.WALK.stepMeters,
      SEARCH_EXPAND.WALK.maxMeters,
    ]);
    assert.deepEqual(searchRadiiFor("WALK", { expand: false }), [SEARCH_EXPAND.WALK.initialMeters]);
    assert.ok(searchRadiiFor("WALK").length <= SEARCH_EXPAND.WALK.maxRounds);
  });
});

describe("diverse candidates", () => {
  it("adds companion categories for a cafe-only wish without searching all 14 kinds", () => {
    const wish = scoutJobsFromWishes("のんびり過ごすデート。気になること：カフェ");
    const extras = companionScoutJobs(wish.jobs, "のんびり過ごすデート。気になること：カフェ");
    assert.ok(wish.jobs.some((job) => job.includedTypes.includes("cafe")));
    assert.ok(extras.some((job) => job.kind === "museum" || job.kind === "nature"));
    assert.ok(extras.length <= 2);
    assert.equal(
      extras.some((job) => job.kind === "aquarium"),
      false,
    );
  });

  it("does not add companions for an explicit cafe hop", () => {
    const text = "カフェ巡りがしたい";
    const wish = scoutJobsFromWishes(text);
    assert.equal(wantsSameKindTour(text), true);
    assert.deepEqual(companionScoutJobs(wish.jobs, text), []);
  });

  it("avoids picking three cafes unless the wish is a cafe hop", () => {
    const cafes = ["a", "b", "c"].map((id) => spot(`cafe-${id}`, ["cafe"], "カフェ"));
    const museum = spot("museum-1", ["museum"], "美術館");
    const diverse = pickFromCandidates({
      walk: [],
      exhibit: [museum],
      sweets: cafes,
      other: [],
      lockedIds: [],
      rain: false,
      avoidIds: [],
      wishText: "のんびり過ごすデート。気になること：カフェ",
    });
    assert.ok(diverse.selected.includes("museum-1"));
    assert.ok(diverse.selected.some((id) => id.startsWith("cafe-")));
    assert.ok(diverse.selected.filter((id) => id.startsWith("cafe-")).length <= 2);

    const tour = pickFromCandidates({
      walk: [],
      exhibit: [],
      sweets: cafes,
      other: [],
      lockedIds: [],
      rain: false,
      avoidIds: [],
      wishText: "カフェ巡りがしたい",
    });
    assert.ok(tour.selected.filter((id) => id.startsWith("cafe-")).length >= 2);
  });

  it("treats missing wish types as a reason to expand", () => {
    const jobs = scoutJobsFromWishes("展示とカフェ").jobs;
    assert.deepEqual(
      jobsMissingCoverage(jobs, [spot("cafe-1", ["cafe"])]).length > 0,
      jobs.some((job) => job.includedTypes.includes("museum") || job.includedTypes.includes("art_gallery")),
    );
    assert.deepEqual(jobsMissingCoverage(jobs, [spot("cafe-1", ["cafe"]), spot("art-1", ["art_gallery"])]), []);
  });
});
