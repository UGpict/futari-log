process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sessionAllowsPriceReapply } from "../src/server/agent/place";
import { LIMITS } from "../src/config/settings";

describe("price reapply session gate", () => {
  it("allows reapply only for unsettled sessions", () => {
    assert.equal(sessionAllowsPriceReapply("DRAFT"), true);
    assert.equal(sessionAllowsPriceReapply(null), true);
    assert.equal(sessionAllowsPriceReapply("CONFIRMED"), false);
    assert.equal(sessionAllowsPriceReapply("IN_PROGRESS"), false);
    assert.equal(sessionAllowsPriceReapply("DONE"), false);
    assert.equal(sessionAllowsPriceReapply("REFLECTED"), false);
  });
});

describe("price enrich daily caps", () => {
  it("documents overall daily run and cost ceilings", () => {
    // Grounded search is costly; keep below catalog ingest scale while allowing a demo day.
    assert.equal(LIMITS.maxPriceEnrichRunsPerDay, 24);
    assert.equal(LIMITS.maxPriceEnrichCostUsdPerDay, 2);
  });
});
