process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nearbySampleEvents } from "../src/features/home/sample-events";

describe("home sample events", () => {
  it("keeps demo samples but never uses sample ids as catalog selectedEventIds", () => {
    assert.ok(nearbySampleEvents.length >= 1);
    for (const event of nearbySampleEvents) {
      assert.equal(event.demo, true);
      assert.ok(event.id.startsWith("sample:"));
      assert.ok(!event.planWish.includes(event.title), "wish must not embed sample event title");
      assert.ok(event.planWish.includes(event.areaWishToken));
    }
  });
});
