import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionSnapshotSchema, startRunRequestSchema } from "../src/contracts/session";
import {
  meResponseSchema,
  sessionAuthRequestSchema,
  sessionAuthResponseSchema,
} from "../src/contracts/me";
import {
  fixtureApproval,
  fixtureFailed,
  fixtureMe,
  fixtureReplan,
  fixtureSuccess,
} from "../src/fixtures/snapshots";
import { fixturesEnabled } from "../src/fixtures";
import { issueSessionFromIdToken } from "../src/server/auth";

describe("contracts / fixtures", () => {
  it("parses UI fixtures as API snapshots", () => {
    for (const snap of [fixtureSuccess, fixtureFailed, fixtureApproval, fixtureReplan]) {
      const parsed = sessionSnapshotSchema.safeParse(snap);
      assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues, null, 2));
    }
    assert.equal(meResponseSchema.safeParse(fixtureMe).success, true);
    assert.equal(fixtureMe.isAnonymous, true);
    assert.deepEqual(fixtureMe.authProviders, ["anonymous"]);
  });

  it("accepts session auth request/response shapes", () => {
    assert.equal(sessionAuthRequestSchema.safeParse({ idToken: "tok" }).success, true);
    assert.equal(sessionAuthRequestSchema.safeParse({}).success, false);
    assert.equal(
      sessionAuthResponseSchema.safeParse({
        uid: "uid_1",
        runtime: "MOCK",
        isAnonymous: true,
        authProviders: ["anonymous"],
      }).success,
      true,
    );
  });

  it("rejects invalid idToken for session exchange without throwing", async () => {
    const issued = await issueSessionFromIdToken("not-a-real-id-token");
    assert.equal(issued, null);
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
