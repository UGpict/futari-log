import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Memory, Spot } from "../src/domain/schemas";
import { collectDirectiveEffects, stayMinutesForSpot } from "../src/domain/memory/directives";
import { bindNextDateMemories, canReadMemory, candidateToMemory } from "../src/domain/memory";
import { resolveWalkHardTotal, evaluateWalkLimits } from "../src/domain/plan/walkLimits";

function mem(partial: Partial<Memory> & Pick<Memory, "id" | "content" | "planDirectives">): Memory {
  return {
    coupleId: "c",
    subject: "BOTH",
    type: "CARE",
    sourceType: "SELF_REPORT",
    reflectionId: "r1",
    reflectionVersion: 1,
    answerId: "a",
    evidenceQuote: partial.content,
    confirmation: "USER_CONFIRMED",
    approvedAt: "2026-09-21T00:00:00.000Z",
    visibility: "PRIVATE",
    strength: "SOFT",
    scope: "NEXT_DATE",
    targetSessionId: null,
    active: true,
    version: 1,
    supersedes: null,
    ...partial,
  };
}

function spot(partial: Partial<Spot> & Pick<Spot, "id" | "name">): Spot {
  return {
    categories: [],
    lat: 35.68,
    lng: 139.76,
    address: null,
    openHours: { value: null, evidenceIds: [] },
    closedDays: { value: null, evidenceIds: [] },
    indoorOutdoor: { value: "INDOOR", evidenceIds: [] },
    standingBurden: { value: "HIGH", evidenceIds: [] },
    restEase: { value: "HARD", evidenceIds: [] },
    costForTwoJpy: { value: 2000, evidenceIds: [] },
    officialUrl: null,
    imageUrl: null,
    imageProvider: null,
    imageAttribution: null,
    placeId: null,
    lastSelectedAt: null,
    environment: { value: "quiet", evidenceIds: [] },
    ...partial,
  } as Spot;
}

describe("structured memory directives", () => {
  it("applies PREFER_SEATED_REST without content regex", () => {
    const withDir = mem({
      id: "mem_rest",
      content: "次回は座れる休憩を挟む",
      planDirectives: [
        {
          kind: "PREFER_SEATED_REST",
          categories: [],
          spotId: null,
          maxStayMinutes: null,
          walkHardCapMinutes: null,
        },
      ],
    });
    const without = mem({
      id: "mem_text_only",
      content: "立つのが大変そうだった",
      planDirectives: [],
    });
    const effectsWith = collectDirectiveEffects([withDir]);
    const effectsWithout = collectDirectiveEffects([without]);
    assert.equal(effectsWith.preferSeatedRest.length, 1);
    assert.equal(effectsWithout.preferSeatedRest.length, 0);

    const high = spot({ id: "s1", name: "展示", standingBurden: { value: "HIGH", evidenceIds: [] }, categories: ["exhibit"] });
    const stayWith = stayMinutesForSpot(high, effectsWith, 50);
    const stayWithout = stayMinutesForSpot(high, effectsWithout, 50);
    assert.equal(stayWith.stay, 35);
    assert.equal(stayWithout.stay, 50);
    assert.ok(stayWith.influences.some((i) => i.memoryId === "mem_rest"));
  });

  it("WALK_HARD_CAP only from HARD directives, not text", () => {
    const softText = mem({
      id: "m1",
      content: "徒歩合計40分まで",
      strength: "SOFT",
      planDirectives: [],
    });
    const hardDir = mem({
      id: "m2",
      content: "徒歩は短めに",
      strength: "HARD",
      type: "CONSTRAINT",
      planDirectives: [
        {
          kind: "WALK_HARD_CAP",
          categories: [],
          spotId: null,
          maxStayMinutes: null,
          walkHardCapMinutes: 40,
        },
      ],
    });
    assert.equal(resolveWalkHardTotal([softText]).minutes, null);
    assert.equal(resolveWalkHardTotal([hardDir]).minutes, 40);
  });

  it("approval candidate rejects hypothesis; NEXT_DATE binds on confirm ids", () => {
    assert.throws(() =>
      candidateToMemory({
        candidate: {
          id: "mc_1",
          coupleId: "c",
          sessionId: "s",
          reflectionId: "r",
          reflectionVersion: 1,
          answerId: null,
          subject: "PARTNER",
          type: "CARE",
          content: "美術館嫌い",
          sourceType: "HYPOTHESIS",
          evidenceQuote: "疲れていた",
          strength: "SOFT",
          scope: "NEXT_DATE",
          planDirectives: [],
          createdAt: "2026-09-21T00:00:00.000Z",
        },
        approvedAt: "2026-09-21T00:00:00.000Z",
        targetSessionId: null,
      }),
    );

    const memories: Record<string, Memory> = {
      mem_a: mem({ id: "mem_a", content: "休憩", planDirectives: [], targetSessionId: null }),
    };
    bindNextDateMemories(memories, "ses_used", ["mem_a"]);
    assert.equal(memories.mem_a.targetSessionId, "ses_used");
    assert.equal(canReadMemory(memories.mem_a, "ses_other"), false);
  });
});

describe("planDirectives correct violating inputs", () => {
  it("walk hard cap: total over the approved HARD limit is flagged as exceeds", () => {
    const hard = mem({
      id: "mem_walk",
      content: "徒歩は短めに",
      strength: "HARD",
      type: "CONSTRAINT",
      planDirectives: [
        {
          kind: "WALK_HARD_CAP",
          categories: [],
          spotId: null,
          maxStayMinutes: null,
          walkHardCapMinutes: 40,
        },
      ],
    });
    const legs = [
      { mode: "WALK" as const, durationMinutes: { value: 25, evidenceIds: [] as string[] } },
      { mode: "WALK" as const, durationMinutes: { value: 25, evidenceIds: [] as string[] } },
    ];
    const without = evaluateWalkLimits("WALK", legs, { hardTotalMinutes: null, enforcePerLeg: false });
    const cap = resolveWalkHardTotal([hard]);
    const withCap = evaluateWalkLimits("WALK", legs, {
      hardTotalMinutes: cap.minutes,
      enforcePerLeg: false,
    });
    assert.equal(without.exceeds, false);
    assert.equal(cap.minutes, 40);
    assert.equal(withCap.totalMinutes, 50);
    assert.equal(withCap.overTotal, true);
    assert.equal(withCap.exceeds, true);
  });

  it("rest: seated-rest directive shortens HIGH standingBurden stay (default 50 → 35)", () => {
    const rest = mem({
      id: "mem_rest2",
      content: "座れる休憩を優先",
      planDirectives: [
        {
          kind: "PREFER_SEATED_REST",
          categories: [],
          spotId: null,
          maxStayMinutes: null,
          walkHardCapMinutes: null,
        },
      ],
    });
    const exhibit = spot({
      id: "ex",
      name: "展示",
      categories: ["exhibit"],
      standingBurden: { value: "HIGH", evidenceIds: [] },
      restEase: { value: "LIMITED", evidenceIds: [] },
    });
    const baseline = stayMinutesForSpot(exhibit, collectDirectiveEffects([]), 50);
    const corrected = stayMinutesForSpot(exhibit, collectDirectiveEffects([rest]), 50);
    assert.equal(baseline.stay, 50);
    assert.equal(corrected.stay, 35);
    assert.ok(corrected.influences.some((i) => i.effect === "DURATION" && i.memoryId === "mem_rest2"));
  });

  it("stay: SHORTEN_CATEGORY_STAY shortens matching category stay to maxStayMinutes", () => {
    const shorten = mem({
      id: "mem_short",
      content: "展示は短めに",
      planDirectives: [
        {
          kind: "SHORTEN_CATEGORY_STAY",
          categories: ["exhibit"],
          spotId: null,
          maxStayMinutes: 30,
          walkHardCapMinutes: null,
        },
      ],
    });
    const exhibit = spot({
      id: "ex2",
      name: "美術館",
      categories: ["museum", "exhibit"],
      standingBurden: { value: "LOW", evidenceIds: [] },
    });
    const cafe = spot({
      id: "cf",
      name: "カフェ",
      categories: ["cafe"],
      standingBurden: { value: "LOW", evidenceIds: [] },
      restEase: { value: "EASY", evidenceIds: [] },
    });
    const effects = collectDirectiveEffects([shorten]);
    assert.equal(stayMinutesForSpot(exhibit, effects, 50).stay, 30);
    assert.equal(stayMinutesForSpot(cafe, effects, 50).stay, 50);
  });

  it("revisit: REVISIT_SPOT ids are ordered ahead of non-revisit candidates", () => {
    const revisit = mem({
      id: "mem_rev",
      content: "あの店にまた行きたい",
      planDirectives: [
        {
          kind: "REVISIT_SPOT",
          categories: [],
          spotId: "spot_fav",
          maxStayMinutes: null,
          walkHardCapMinutes: null,
        },
      ],
    });
    const effects = collectDirectiveEffects([revisit]);
    assert.ok(effects.revisitSpotIds.has("spot_fav"));
    const unlocked = ["spot_new", "spot_fav", "spot_other"];
    const ordered = [...unlocked].sort((a, b) => {
      const aRev = effects.revisitSpotIds.has(a) ? 0 : 1;
      const bRev = effects.revisitSpotIds.has(b) ? 0 : 1;
      return aRev - bRev;
    });
    assert.deepEqual(ordered, ["spot_fav", "spot_new", "spot_other"]);
  });
});
