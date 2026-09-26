import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetOpsCountersForTests } from "../src/server/ops/counters";
import { consumeApiBudget, budgetCounterKey } from "../src/server/ops/budget";
import {
  consumeRateLimit,
  rateLimitCounterKey,
  rateLimitSubject,
  tokyoDayBucket,
  tokyoMinuteBucket,
} from "../src/server/ops/rateLimit";

const PREV_BACKEND = process.env.OPS_COUNTER_BACKEND;
const PREV_PLACES_MIN = process.env.RATE_LIMIT_PLACES_SEARCH_PER_MINUTE;
const PREV_PLACES_DAY = process.env.RATE_LIMIT_PLACES_SEARCH_PER_DAY;
const PREV_BUDGET_PLACES = process.env.API_BUDGET_PLACES_PER_DAY;

beforeEach(() => {
  process.env.OPS_COUNTER_BACKEND = "memory";
  process.env.RATE_LIMIT_PLACES_SEARCH_PER_MINUTE = "2";
  process.env.RATE_LIMIT_PLACES_SEARCH_PER_DAY = "3";
  process.env.API_BUDGET_PLACES_PER_DAY = "2";
  // Force getEnv() to re-read if it caches — getEnv reads process.env each call after loadDotEnv once.
  resetOpsCountersForTests();
});

afterEach(() => {
  if (PREV_BACKEND == null) delete process.env.OPS_COUNTER_BACKEND;
  else process.env.OPS_COUNTER_BACKEND = PREV_BACKEND;
  if (PREV_PLACES_MIN == null) delete process.env.RATE_LIMIT_PLACES_SEARCH_PER_MINUTE;
  else process.env.RATE_LIMIT_PLACES_SEARCH_PER_MINUTE = PREV_PLACES_MIN;
  if (PREV_PLACES_DAY == null) delete process.env.RATE_LIMIT_PLACES_SEARCH_PER_DAY;
  else process.env.RATE_LIMIT_PLACES_SEARCH_PER_DAY = PREV_PLACES_DAY;
  if (PREV_BUDGET_PLACES == null) delete process.env.API_BUDGET_PLACES_PER_DAY;
  else process.env.API_BUDGET_PLACES_PER_DAY = PREV_BUDGET_PLACES;
  resetOpsCountersForTests();
});

describe("rateLimitSubject", () => {
  it("prefers uid over ip", () => {
    assert.equal(rateLimitSubject("user-1", "1.2.3.4"), "uid:user-1");
    assert.equal(rateLimitSubject(null, "1.2.3.4"), "ip:1.2.3.4");
    assert.equal(rateLimitSubject("  ", "9.9.9.9"), "ip:9.9.9.9");
  });
});

describe("rate limit windows", () => {
  it("builds stable Tokyo minute/day keys", () => {
    const now = new Date("2026-09-26T03:15:30.000Z"); // Tokyo = 12:15
    assert.equal(tokyoMinuteBucket(now), "2026-09-26T12:15");
    assert.equal(tokyoDayBucket(now), "2026-09-26");
    const subject = "uid:u1";
    assert.equal(
      rateLimitCounterKey("places_search", subject, "minute", now),
      "rate:places_search:uid:u1:minute:2026-09-26T12:15",
    );
    assert.equal(
      rateLimitCounterKey("places_search", subject, "day", now),
      "rate:places_search:uid:u1:day:2026-09-26",
    );
  });

  it("allows until per-minute limit then returns RATE_LIMITED", async () => {
    const now = new Date("2026-09-26T03:15:30.000Z");
    const a = await consumeRateLimit({ bucket: "places_search", uid: "u1", ip: "1.1.1.1", now });
    const b = await consumeRateLimit({ bucket: "places_search", uid: "u1", ip: "1.1.1.1", now });
    const c = await consumeRateLimit({ bucket: "places_search", uid: "u1", ip: "1.1.1.1", now });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(c.ok, false);
    if (!c.ok) {
      assert.equal(c.error.code, "RATE_LIMITED");
      assert.equal(c.error.status, 429);
    }
  });

  it("enforces daily window across minute buckets", async () => {
    const m1 = new Date("2026-09-26T03:15:00.000Z");
    const m2 = new Date("2026-09-26T03:16:00.000Z");
    assert.equal((await consumeRateLimit({ bucket: "places_search", uid: "u2", ip: "x", now: m1 })).ok, true);
    assert.equal((await consumeRateLimit({ bucket: "places_search", uid: "u2", ip: "x", now: m1 })).ok, true);
    // new minute → minute window resets, but day cap is 3
    assert.equal((await consumeRateLimit({ bucket: "places_search", uid: "u2", ip: "x", now: m2 })).ok, true);
    const over = await consumeRateLimit({ bucket: "places_search", uid: "u2", ip: "x", now: m2 });
    assert.equal(over.ok, false);
    if (!over.ok) assert.equal(over.error.code, "RATE_LIMITED");
  });
});

describe("api budget", () => {
  it("keys by Tokyo day and kind", () => {
    const now = new Date("2026-09-26T03:15:30.000Z");
    assert.equal(budgetCounterKey("places", now), "budget:places:2026-09-26");
  });

  it("allows until daily budget then returns API_BUDGET_EXCEEDED", async () => {
    const now = new Date("2026-09-26T03:15:30.000Z");
    assert.equal((await consumeApiBudget("places", now)).ok, true);
    assert.equal((await consumeApiBudget("places", now)).ok, true);
    const over = await consumeApiBudget("places", now);
    assert.equal(over.ok, false);
    if (!over.ok) {
      assert.equal(over.error.code, "API_BUDGET_EXCEEDED");
      assert.equal(over.error.status, 503);
    }
  });

  it("tracks kinds independently", async () => {
    const now = new Date("2026-09-26T03:15:30.000Z");
    process.env.API_BUDGET_ROUTES_PER_DAY = "1";
    assert.equal((await consumeApiBudget("places", now)).ok, true);
    // routes budget tightened for this case only
    const prevRoutes = process.env.API_BUDGET_ROUTES_PER_DAY;
    process.env.API_BUDGET_ROUTES_PER_DAY = "1";
    try {
      assert.equal((await consumeApiBudget("routes", now)).ok, true);
      const routesOver = await consumeApiBudget("routes", now);
      assert.equal(routesOver.ok, false);
      assert.equal((await consumeApiBudget("places", now)).ok, true);
    } finally {
      if (prevRoutes == null) delete process.env.API_BUDGET_ROUTES_PER_DAY;
      else process.env.API_BUDGET_ROUTES_PER_DAY = prevRoutes;
    }
  });
});
