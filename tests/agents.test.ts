import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessHours, parsePlaceHours, parseYenRange } from "../src/server/providers/placeFacts";
import { remember, emptyMemory, dailyFresh } from "../src/server/agent/memory";
import { pickFromCandidates, runPlanner } from "../src/server/agent/planner";
import { runScout, scoutAreaKey } from "../src/server/agent/scout";
import type { AgentMemories } from "../src/server/agent/types";
import { sameTokyoDate } from "../src/lib/time";
import { checkOpen, type ProviderCtx } from "../src/server/providers";
import { searchCatalog } from "../src/server/providers/catalog";

function parts(iso: string) {
  const date = new Date(iso);
  return {
    hour: date.getUTCHours() + 9,
    minute: date.getUTCMinutes(),
    weekday: 6,
  };
}

describe("place facts", () => {
  it("parses Google opening periods into weekday rules", () => {
    const hours = parsePlaceHours({
      periods: [
        { open: { day: 6, hour: 10, minute: 0 }, close: { day: 6, hour: 18, minute: 0 } },
      ],
    });
    assert.deepEqual(hours, [{ days: [6], open: "10:00", close: "18:00" }]);
    assert.equal(
      assessHours(hours, "2026-09-19T01:00:00.000Z", "2026-09-19T04:00:00.000Z", parts),
      "OPEN",
    );
  });

  it("keeps non-JPY priceRange as unknown", () => {
    assert.equal(
      parseYenRange({
        startPrice: { currencyCode: "USD", units: "10" },
        endPrice: { currencyCode: "USD", units: "20" },
      }),
      null,
    );
    assert.deepEqual(
      parseYenRange({
        startPrice: { currencyCode: "JPY", units: "1200" },
        endPrice: { currencyCode: "JPY", units: "2400" },
      }),
      { min: 1200, max: 2400 },
    );
  });

  it("does not invent hours when periods are missing", () => {
    assert.equal(assessHours([], "2026-09-19T01:00:00.000Z", "2026-09-19T04:00:00.000Z", parts), "UNKNOWN");
  });
});

describe("agent memory", () => {
  it("keeps the latest notes per agent", () => {
    const memories: AgentMemories = { scout: emptyMemory("scout") };
    remember(memories, "scout", { note: "first" });
    remember(memories, "scout", { note: "second", factKey: "area", factValue: 1 });
    assert.deepEqual(memories.scout?.notes, ["first", "second"]);
    assert.equal(memories.scout?.facts.area, 1);
  });

  it("treats same Tokyo calendar day as fresh", () => {
    assert.equal(sameTokyoDate(new Date().toISOString()), true);
    assert.equal(dailyFresh("2000-01-01T00:00:00.000Z"), false);
  });
});

describe("scout daily snapshot", () => {
  it("does not hit Places when today's snapshot is present", async () => {
    const area = { lat: 35.681236, lng: 139.767125, name: "東京駅周辺" };
    const spot = {
      id: "ChIJ-park",
      name: "park",
      lat: 35.68,
      lng: 139.76,
      categories: ["park"],
      environment: { value: "OUTDOOR" as const, evidenceIds: [] as string[] },
      costForTwoJpy: { value: null, evidenceIds: [] as string[] },
      restEase: { value: null, evidenceIds: [] as string[] },
      standingBurden: { value: null, evidenceIds: [] as string[] },
      officialUrl: null,
    };
    const memories: AgentMemories = { scout: emptyMemory("scout") };
    remember(memories, "scout", {
      factKey: "daily",
      factValue: {
        fetchedAt: new Date().toISOString(),
        areaKey: scoutAreaKey(area, 2500),
        walk: [spot],
        exhibit: [],
        sweets: [],
        other: [],
      },
    });
    let http = 0;
    const events: string[] = [];
    const result = await runScout({
      ctx: {
        runId: "run_test",
        overlays: [],
        cache: new Map(),
        httpAttempts: 0,
        onHttp: () => {
          http += 1;
        },
      },
      log: async (_agent, type) => {
        events.push(type);
      },
      memories,
      area,
      radiusMeters: 2500,
    });
    assert.equal(http, 0);
    assert.equal(result.walk[0]?.id, "ChIJ-park");
    assert.ok(events.includes("CACHE_HIT"));
  });
});

describe("planner candidate pick", () => {
  it("uses live search ids instead of catalog mock ids", () => {
    const spot = (id: string, env: "INDOOR" | "OUTDOOR" = "INDOOR") => ({
      id,
      name: id,
      lat: 35.17,
      lng: 136.88,
      categories: ["cafe"],
      environment: { value: env, evidenceIds: [] as string[] },
      costForTwoJpy: { value: null, evidenceIds: [] as string[] },
      restEase: { value: null, evidenceIds: [] as string[] },
      standingBurden: { value: null, evidenceIds: [] as string[] },
      officialUrl: null,
    });
    const picked = pickFromCandidates({
      walk: [spot("ChIJ-park", "OUTDOOR")],
      exhibit: [spot("ChIJ-museum")],
      sweets: [spot("ChIJ-cafe")],
      other: [spot("ChIJ-book")],
      lockedIds: [],
      rain: false,
      avoidIds: [],
    });
    assert.equal(picked.selected.some((id) => id.startsWith("mock:")), false);
    assert.ok(picked.selected.includes("ChIJ-museum"));
    assert.ok(picked.selected.includes("ChIJ-park"));
    assert.ok(picked.selected.includes("ChIJ-cafe"));
  });

  it("does not call an LLM for selection", async () => {
    const spot = (id: string) => ({
      id,
      name: id,
      lat: 35.68,
      lng: 139.76,
      categories: ["cafe"],
      environment: { value: "INDOOR" as const, evidenceIds: [] as string[] },
      costForTwoJpy: { value: null, evidenceIds: [] as string[] },
      restEase: { value: null, evidenceIds: [] as string[] },
      standingBurden: { value: null, evidenceIds: [] as string[] },
      officialUrl: null,
    });
    const result = await runPlanner({
      log: async () => undefined,
      memories: {},
      runId: "run_det",
      task: "final_plan",
      signal: new AbortController().signal,
      preferences: [],
      lockedIds: [],
      rain: false,
      memoriesForPrompt: [],
      walk: [spot("ChIJ-park")],
      exhibit: [spot("ChIJ-museum")],
      sweets: [spot("ChIJ-cafe")],
      other: [],
    });
    assert.equal(result.llm.actualModel, "deterministic/planner");
    assert.equal(result.llm.costJpy, 0);
    assert.ok(result.selected.length >= 3);
  });
});

describe("checkOpen with place agent hours", () => {
  it("uses ctx.placeHours instead of the mock catalog", async () => {
    const ctx: ProviderCtx = {
      runId: "run_test",
      overlays: [],
      cache: new Map(),
      httpAttempts: 0,
      onHttp: () => undefined,
      placeHours: {
        "ChIJ-live": [{ days: [0, 1, 2, 3, 4, 5, 6], open: "00:00", close: "24:00" }],
      },
    };
    const result = await checkOpen(ctx, {
      spotId: "ChIJ-live",
      startAt: "2026-09-19T04:00:00+09:00",
      endAt: "2026-09-19T05:00:00+09:00",
    });
    assert.equal(result.state, "OPEN");
  });
});

describe("mock catalog area filter", () => {
  it("does not return Nagoya spots for a Tokyo-station radius search", () => {
    const tokyo = { lat: 35.681236, lng: 139.767125 };
    const exhibit = searchCatalog("展示-美術館", tokyo, 2500);
    const sweets = searchCatalog("甘味-カフェ", tokyo, 2500);
    const walk = searchCatalog("散歩-公園", tokyo, 2500);
    assert.equal(exhibit.some((s) => s.id.startsWith("mock:nagoya") || s.id.includes("aichi")), false);
    assert.ok(exhibit.some((s) => s.id === "mock:tokyo-station-gallery"));
    assert.ok(sweets.some((s) => s.categories.includes("cafe")));
    assert.ok(walk.some((s) => s.categories.includes("park")));
    const nagoya = searchCatalog("展示-美術館", { lat: 35.170915, lng: 136.881537 }, 2500);
    assert.ok(nagoya.some((s) => s.id === "mock:aichi-art-museum"));
  });
});
