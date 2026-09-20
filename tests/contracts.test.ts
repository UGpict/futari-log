import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionSnapshotSchema, startRunRequestSchema } from "../src/contracts/session";
import { meResponseSchema } from "../src/contracts/me";
import {
  fixtureApproval,
  fixtureFailed,
  fixtureMe,
  fixtureReplan,
  fixtureSuccess,
} from "../src/fixtures/snapshots";
import { fixturesEnabled } from "../src/fixtures";

describe("contracts / fixtures", () => {
  it("parses UI fixtures as API snapshots", () => {
    for (const snap of [fixtureSuccess, fixtureFailed, fixtureApproval, fixtureReplan]) {
      const parsed = sessionSnapshotSchema.safeParse(snap);
      assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
    }
    assert.equal(meResponseSchema.safeParse(fixtureMe).success, true);
  });

  it("does not enable fixtures when LIVE public runtime is set", () => {
    const prevFix = process.env.NEXT_PUBLIC_USE_API_FIXTURES;
    const prevRt = process.env.NEXT_PUBLIC_APP_RUNTIME;
    process.env.NEXT_PUBLIC_USE_API_FIXTURES = "true";
    process.env.NEXT_PUBLIC_APP_RUNTIME = "LIVE";
    assert.equal(fixturesEnabled(), false);
    process.env.NEXT_PUBLIC_USE_API_FIXTURES = prevFix;
    process.env.NEXT_PUBLIC_APP_RUNTIME = prevRt;
  });

  it("accepts structured replan fields without stuffing an item id into trigger", () => {
    const parsed = startRunRequestSchema.parse({
      kind: "REPLAN",
      instruction: "別のカフェがいい",
      targetPlanItemId: "it_1",
      basePlanVersion: 2,
    });
    assert.equal(parsed.instruction, "別のカフェがいい");
    assert.equal(parsed.targetPlanItemId, "it_1");
    assert.equal(parsed.basePlanVersion, 2);
    assert.equal(parsed.trigger, undefined);
  });
});
