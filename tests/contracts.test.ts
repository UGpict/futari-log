import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionSnapshotSchema } from "../src/contracts/session";
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
});
