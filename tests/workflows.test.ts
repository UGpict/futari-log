import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workflowHeaderOk } from "../src/server/workflows/auth";

describe("workflow invoke auth", () => {
  it("rejects missing or mismatched secrets", () => {
    assert.equal(workflowHeaderOk(null, "secret"), false);
    assert.equal(workflowHeaderOk("secret", null), false);
    assert.equal(workflowHeaderOk("nope", "secret"), false);
    assert.equal(workflowHeaderOk("secret", "secret"), true);
  });
});
