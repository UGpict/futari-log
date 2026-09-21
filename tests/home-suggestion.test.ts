process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_SUGGESTION, planningSeedFromHomeSuggestion } from "../src/features/home/home-suggestion";
import { MOCK_CATALOG } from "../src/server/providers/catalog";
import { searchCatalog } from "../src/server/providers/catalog";
import { scoutJobsFromWishes } from "../src/contracts/spotKinds";

const TOKYO_STATION = { lat: 35.681236, lng: 139.767125 };

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

describe("home suggestion plan seed", () => {
  it("maps DTO to PlanForm submit area and window (not Tokyo Station)", () => {
    const seed = planningSeedFromHomeSuggestion(HOME_SUGGESTION);
    assert.equal(seed.areaName, "清澄白河駅");
    assert.equal(seed.areaLat, HOME_SUGGESTION.meetPlace.lat);
    assert.equal(seed.areaLng, HOME_SUGGESTION.meetPlace.lng);
    assert.equal(seed.startTime, "15:00");
    assert.equal(seed.endTime, "21:00");
    assert.notEqual(seed.areaLat, TOKYO_STATION.lat);
    assert.notEqual(seed.areaLng, TOKYO_STATION.lng);
    assert.ok(haversineMeters({ lat: seed.areaLat, lng: seed.areaLng }, TOKYO_STATION) > 2000);
    assert.deepEqual(HOME_SUGGESTION.routeLabels, ["美術館・展示", "夜カフェ"]);
  });

  it("keeps MOCK search center on Kiyosumi station when seeding area from DTO", () => {
    const seed = planningSeedFromHomeSuggestion(HOME_SUGGESTION);
    assert.ok(
      HOME_SUGGESTION.meetPlace.id.startsWith("ChIJ"),
      "meetPlace.id must be a real Places ID, not seed:",
    );
    const jobs = scoutJobsFromWishes(seed.wish);
    assert.ok(jobs.jobs.some((job) => job.kind === "museum"));
    assert.ok(jobs.jobs.some((job) => job.kind === "cafe"));

    const center = { lat: seed.areaLat, lng: seed.areaLng };
    assert.ok(Math.abs(center.lat - TOKYO_STATION.lat) > 0.01 || Math.abs(center.lng - TOKYO_STATION.lng) > 0.01);

    const within1200 = MOCK_CATALOG.filter((spot) => haversineMeters(center, spot) <= 1200);
    const cafeOrMuseumNear = searchCatalog("カフェ", center, 1200, ["cafe"]).concat(
      searchCatalog("展示", center, 1200, ["museum", "art_gallery"]),
    );

    // Opening-hours / self-correct fixtures live near Kiyosumi (not Tokyo Station).
    assert.ok(within1200.some((s) => s.id.startsWith("mock:kiyosumi-")));
    assert.ok(cafeOrMuseumNear.some((s) => s.id.startsWith("mock:kiyosumi-")));
    assert.ok(
      within1200.every((s) => haversineMeters(TOKYO_STATION, s) > 2000),
      "Kiyosumi fixtures must stay far from Tokyo Station",
    );
  });
});
