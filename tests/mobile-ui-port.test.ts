process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideReflectionSave,
  reflectionSaveNotice,
} from "../src/features/home/reflection-save";
import { resolvePlanFormSeed } from "../src/features/home/plan-seed";
import { HOME_SUGGESTION } from "../src/features/home/home-suggestion";
import { appendFeedbackQuick, FEEDBACK_QUICK_OPTIONS } from "../src/features/session/feedback-quick";
import { evaluateWalkLimits } from "../src/domain/plan/walkLimits";

describe("reflection save destination", () => {
  it("routes one reflectable plan to the server", () => {
    const decision = decideReflectionSave({
      isFixture: false,
      reflectableSessionIds: ["sess_a"],
    });
    assert.deepEqual(decision, { dest: "server", sessionId: "sess_a" });
    assert.match(reflectionSaveNotice(decision), /サーバー/);
  });

  it("keeps fixture saves on the device", () => {
    const decision = decideReflectionSave({
      isFixture: true,
      reflectableSessionIds: ["sess_a"],
    });
    assert.deepEqual(decision, { dest: "local", reason: "fixture" });
    assert.match(reflectionSaveNotice(decision), /端末/);
  });

  it("keeps zero-plan days on the device", () => {
    const decision = decideReflectionSave({
      isFixture: false,
      reflectableSessionIds: [],
    });
    assert.deepEqual(decision, { dest: "local", reason: "none" });
    assert.match(reflectionSaveNotice(decision), /端末/);
  });

  it("keeps multi-plan days on the device without picking a session", () => {
    const decision = decideReflectionSave({
      isFixture: false,
      reflectableSessionIds: ["sess_a", "sess_b"],
    });
    assert.deepEqual(decision, { dest: "local", reason: "multiple" });
    assert.match(reflectionSaveNotice(decision), /端末/);
  });
});

describe("plan seed resolution", () => {
  it("loads home-suggestion meet place and 15:00–21:00", () => {
    const seed = resolvePlanFormSeed("home-suggestion");
    assert.ok(seed);
    assert.equal(seed.meet?.id, HOME_SUGGESTION.meetPlace.id);
    assert.equal(seed.meet?.name, "清澄白河駅");
    assert.equal(seed.startTime, "15:00");
    assert.equal(seed.endTime, "21:00");
    assert.equal(seed.wish, HOME_SUGGESTION.wish);
  });

  it("ignores unknown seed keys", () => {
    assert.equal(resolvePlanFormSeed("unknown-seed"), undefined);
    assert.equal(resolvePlanFormSeed(""), undefined);
    assert.equal(resolvePlanFormSeed(null), undefined);
  });

  it("ignores display-only sample seeds", () => {
    assert.equal(resolvePlanFormSeed("sample:odd-exhibition"), undefined);
    assert.equal(resolvePlanFormSeed("sample:night-garden"), undefined);
    assert.equal(resolvePlanFormSeed("sample:mystery-walk"), undefined);
  });

  it("loads AI HACK seed with Tomoshibi venue and fixed afternoon block", () => {
    const seed = resolvePlanFormSeed("sample:ai-hack");
    assert.ok(seed);
    assert.equal(seed.meet?.name, "燈株式会社オフィス");
    assert.ok(seed.meet?.address?.includes("神田駿河台4丁目6"));
    assert.equal(seed.startTime, "10:00");
    assert.equal(seed.endTime, "21:00");
    assert.equal(seed.fixed?.label, "AI HACK 2026");
    assert.equal(seed.fixed?.startTime, "10:00");
    assert.equal(seed.fixed?.endTime, "16:00");
    assert.equal(seed.fixed?.spotId, "demo:tomoshibi-surugadai");
    assert.ok(seed.wish?.includes("飲み屋"));
  });
});

describe("feedback quick append (3691949)", () => {
  it("appends with newlines and does not toggle", () => {
    let value = "";
    value = appendFeedbackQuick(value, FEEDBACK_QUICK_OPTIONS[0]);
    value = appendFeedbackQuick(value, FEEDBACK_QUICK_OPTIONS[1]);
    value = appendFeedbackQuick(value, FEEDBACK_QUICK_OPTIONS[0]);
    assert.equal(
      value,
      "別の場所がいい\nもう少し予算を抑えたい\n別の場所がいい",
    );
  });
});

describe("walk limits vs travel mode", () => {
  const longWalkLeg = {
    id: "leg1",
    from: "MEET" as const,
    to: "SPOT" as const,
    mode: "WALK" as const,
    durationMinutes: { value: 45, evidenceIds: [] as string[] },
  };

  it("flags long WALK legs when enforcePerLeg defaults for WALK", () => {
    const result = evaluateWalkLimits("WALK", [longWalkLeg]);
    assert.equal(result.overLeg, true);
    assert.equal(result.exceeds, true);
  });

  it("does not enforce per-leg walk caps for TRANSIT by default", () => {
    const result = evaluateWalkLimits("TRANSIT", [
      { ...longWalkLeg, mode: "TRANSIT", walkMinutesWithin: { value: 45, evidenceIds: [] } },
    ], { enforcePerLeg: false });
    assert.equal(result.overLeg, false);
    assert.equal(result.exceeds, false);
  });

  it("does not enforce per-leg walk caps for DRIVE by default", () => {
    const result = evaluateWalkLimits("DRIVE", [
      { ...longWalkLeg, mode: "DRIVE", durationMinutes: { value: 20, evidenceIds: [] } },
    ], { enforcePerLeg: false });
    assert.equal(result.overLeg, false);
    assert.equal(result.exceeds, false);
  });
});
