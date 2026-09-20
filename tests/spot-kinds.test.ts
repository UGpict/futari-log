import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySpotKind,
  explainWishMatch,
  matchableKinds,
  placeTypeList,
  scoutJobsFromWishes,
  searchTypesForWishText,
  SPOT_KIND_DISPLAY_ORDER,
  spotMatchesKind,
  spotMatchesWish,
} from "../src/contracts/spotKinds";
import { preferenceMatchIds } from "../src/domain/plan/validatePlan";
import { scoutJobsForPreferences } from "../src/server/agent/scoutJobs";
import { searchCatalog } from "../src/server/providers/catalog";
import { spotVisual } from "../src/features/session/spot-visuals";

describe("spot kind classification", () => {
  it("keeps primaryType and types together without overwriting either", () => {
    assert.deepEqual(placeTypeList("cafe", ["cafe", "food", "point_of_interest"]), [
      "cafe",
      "food",
      "point_of_interest",
    ]);
    assert.deepEqual(placeTypeList("museum", ["tourist_attraction", "point_of_interest"]), [
      "museum",
      "tourist_attraction",
      "point_of_interest",
    ]);
    assert.deepEqual(placeTypeList("cafe", undefined), ["cafe"]);
    assert.deepEqual(placeTypeList(null, ["art_gallery"]), ["art_gallery"]);
  });

  it("does not treat generic food as a restaurant", () => {
    assert.equal(classifySpotKind("スターバックス", ["cafe", "food", "point_of_interest"]), "cafe");
    assert.equal(classifySpotKind("焼肉", ["restaurant", "food"]), "dining");
    assert.equal(classifySpotKind("パン屋", ["bakery", "store"]), "sweets");
    assert.equal(classifySpotKind("ワインバー", ["bar", "food"]), "bar");
  });

  it("prefers park over tourist_attraction, and name over generic town types", () => {
    assert.equal(classifySpotKind("名古屋城", ["tourist_attraction", "park"]), "nature");
    assert.equal(classifySpotKind("ミッドランドスクエア スカイプロムナード", ["tourist_attraction"]), "town");
    assert.equal(classifySpotKind("名古屋駅", ["transit_station"]), "other");
  });

  it("maps the same kinds on the session card icons", () => {
    assert.equal(spotVisual("コメダ珈琲店", ["cafe"]).id, "cafe");
    assert.equal(spotVisual("ジェイアール名古屋タカシマヤ スイーツ", ["bakery"]).id, "sweets");
    assert.equal(spotVisual("愛知県美術館", ["art_gallery", "museum"]).id, "museum");
    assert.equal(spotVisual("東京ステーションギャラリー", ["art_gallery"]).label, "アート・展示");
  });
});

describe("wish to scout types", () => {
  it("splits cafe and sweets, and keeps aquarium off zoo", () => {
    const mapped = scoutJobsForPreferences([
      { content: "のんびり過ごすデート。気になること：カフェ、スイーツ、水族館、動物園" },
    ]);
    assert.ok(mapped.jobs.some((job) => job.kind === "cafe" && job.includedTypes.includes("cafe")));
    assert.ok(mapped.jobs.some((job) => job.kind === "sweets" && job.includedTypes.includes("bakery")));
    assert.ok(mapped.jobs.some((job) => job.includedTypes.includes("aquarium")));
    assert.ok(mapped.jobs.some((job) => job.includedTypes.includes("zoo")));
    assert.equal(
      mapped.jobs.some((job) => job.includedTypes.includes("aquarium") && job.includedTypes.includes("zoo")),
      false,
    );
  });

  it("maps the remaining chips to Places types", () => {
    const mapped = scoutJobsFromWishes("お肉、映画、温泉、ショッピング、ボウリング、街の写真を撮る");
    assert.ok(mapped.jobs.some((job) => job.includedTypes.includes("restaurant")));
    assert.ok(mapped.jobs.some((job) => job.includedTypes.includes("movie_theater")));
    assert.ok(mapped.unsupported.includes("温泉"));
    assert.equal(
      mapped.jobs.some((job) => job.includedTypes.includes("spa")),
      false,
    );
    assert.ok(mapped.jobs.some((job) => job.includedTypes.includes("shopping_mall")));
    assert.ok(mapped.jobs.some((job) => job.includedTypes.includes("bowling_alley")));
    assert.ok(mapped.jobs.some((job) => job.kind === "town"));
    const stage = scoutJobsFromWishes("舞台を見たい");
    assert.ok(stage.jobs.some((job) => job.includedTypes.includes("performing_arts_theater")));
    assert.equal(stage.jobs.some((job) => job.includedTypes.includes("movie_theater")), false);
  });

  it("asks before searching when 温泉 cannot be type-fulfilled", () => {
    const mapped = scoutJobsFromWishes("のんびり温泉に入りたい");
    assert.deepEqual(mapped.unsupported, ["温泉"]);
    assert.equal(mapped.jobs.some((job) => job.includedTypes.includes("spa")), false);
    assert.equal(spotMatchesWish({ name: "スパ", categories: ["spa"] }, "温泉"), false);
    const asSpa = scoutJobsFromWishes("のんびりスパに入りたい");
    assert.equal(asSpa.unsupported.length, 0);
    assert.ok(asSpa.jobs.some((job) => job.includedTypes.includes("spa")));
  });

  it("keeps ものづくり体験 unsupported and does not invent a type", () => {
    const mapped = scoutJobsFromWishes("ものづくり体験をしたい");
    assert.deepEqual(mapped.unsupported, ["ものづくり体験"]);
    assert.equal(
      mapped.jobs.some((job) => job.includedTypes.some((type) => /craft|workshop|ものづくり/.test(type))),
      false,
    );
  });
});

describe("preference and catalog matching", () => {
  it("lets 甘いもの match a cafe without treating cafe as a restaurant", () => {
    assert.equal(
      spotMatchesWish({ name: "カフェ", categories: ["cafe"] }, "甘いもの"),
      true,
    );
    assert.equal(
      spotMatchesWish({ name: "カフェ", categories: ["cafe"] }, "お肉"),
      false,
    );
  });

  it("does not treat the display kind as wish fulfillment", () => {
    assert.equal(spotMatchesWish({ name: "劇場", categories: ["performing_arts_theater"] }, "映画"), false);
    assert.equal(spotMatchesWish({ name: "映画館", categories: ["movie_theater"] }, "映画"), true);
    assert.equal(spotMatchesWish({ name: "公園", categories: ["park"] }, "海を眺める"), false);
    assert.equal(spotMatchesWish({ name: "ビーチ", categories: ["beach"] }, "海を眺める"), true);
    assert.equal(spotMatchesWish({ name: "スパ", categories: ["spa"] }, "温泉"), false);
    assert.equal(explainWishMatch({ name: "温泉", categories: ["spa"] }, "温泉")?.confidence, "name");
    assert.equal(spotMatchesWish({ name: "温泉", categories: ["spa"] }, "温泉"), false);
    assert.equal(spotMatchesWish({ name: "スパ", categories: ["spa"] }, "スパ"), true);
    assert.equal(spotMatchesWish({ name: "動物園", categories: ["zoo"] }, "水族館"), false);
    assert.equal(spotMatchesWish({ name: "水族館", categories: ["aquarium"] }, "水族館"), true);
  });

  it("keeps cafe+restaurant in dining candidates while cafe-only cannot fulfill 食事", () => {
    assert.deepEqual(matchableKinds(["cafe", "restaurant"]).sort(), ["cafe", "dining"].sort());
    assert.equal(classifySpotKind("カフェレストラン", ["cafe", "restaurant"]), "cafe");
    assert.equal(spotMatchesKind("カフェレストラン", ["cafe", "restaurant"], "dining"), true);
    assert.equal(spotMatchesKind("カフェ", ["cafe"], "dining"), false);
    assert.ok(searchTypesForWishText("食事").includes("restaurant"));
    assert.equal(spotMatchesWish({ name: "カフェレストラン", categories: ["cafe", "restaurant"] }, "おいしいもの"), true);
    assert.equal(spotMatchesWish({ name: "カフェ", categories: ["cafe"] }, "おいしいもの"), false);
  });

  it("records type-backed matches only on MUST preference ids", () => {
    const movieMust = {
      id: "p_movie",
      subject: "SELF" as const,
      content: "映画",
      priority: "MUST" as const,
      source: "SELF_REPORT" as const,
    };
    assert.deepEqual(preferenceMatchIds({
      id: "stage",
      name: "劇場",
      lat: 0,
      lng: 0,
      categories: ["performing_arts_theater"],
      environment: { value: "INDOOR", evidenceIds: [] },
      costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: [] },
      restEase: { value: "LIMITED", evidenceIds: [] },
      standingBurden: { value: "MEDIUM", evidenceIds: [] },
      officialUrl: null,
    }, [movieMust]), []);
    assert.deepEqual(preferenceMatchIds({
      id: "cinema",
      name: "映画館",
      lat: 0,
      lng: 0,
      categories: ["movie_theater"],
      environment: { value: "INDOOR", evidenceIds: [] },
      costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: [] },
      restEase: { value: "LIMITED", evidenceIds: [] },
      standingBurden: { value: "MEDIUM", evidenceIds: [] },
      officialUrl: null,
    }, [movieMust]), ["p_movie"]);
  });

  it("still finds Tokyo catalog spots by the 14-kind scout labels", () => {
    const tokyo = { lat: 35.681236, lng: 139.767125 };
    const exhibit = searchCatalog("展示", tokyo, 2500);
    const cafe = searchCatalog("カフェ", tokyo, 2500);
    const walk = searchCatalog("散策-公園", tokyo, 2500, ["park"]);
    assert.ok(exhibit.some((spot) => spot.id === "mock:tokyo-station-gallery"));
    assert.ok(cafe.some((spot) => spot.id === "mock:cafe-kitte"));
    assert.ok(walk.some((spot) => spot.categories.includes("park")));
  });

  it("keeps the 14 display kinds", () => {
    assert.equal(SPOT_KIND_DISPLAY_ORDER.length + 1, 14);
    assert.equal(spotVisual("映画館", ["movie_theater"]).id, "cinema");
    assert.equal(spotVisual("劇場", ["performing_arts_theater"]).id, "cinema");
  });
});
