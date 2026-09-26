import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { CIRCUIT_BREAKER } from "../src/config/settings";
import {
  assertBreakerAllows,
  getBreakerState,
  recordBreakerFailure,
  recordBreakerSuccess,
  resetBreakersForTests,
  runWithBreaker,
  setBreakerClockForTests,
} from "../src/server/ops/breaker";
import { isOpsGuardError } from "../src/server/ops/errors";

beforeEach(() => {
  resetBreakersForTests();
});

afterEach(() => {
  resetBreakersForTests();
});

describe("circuit breaker state transitions", () => {
  it("stays CLOSED until failureThreshold then OPEN", () => {
    for (let i = 0; i < CIRCUIT_BREAKER.failureThreshold - 1; i++) {
      recordBreakerFailure("places");
      assert.equal(getBreakerState("places").state, "CLOSED");
    }
    recordBreakerFailure("places");
    assert.equal(getBreakerState("places").state, "OPEN");
  });

  it("fail-fast with CIRCUIT_OPEN while OPEN", async () => {
    for (let i = 0; i < CIRCUIT_BREAKER.failureThreshold; i++) {
      recordBreakerFailure("routes");
    }
    assert.equal(getBreakerState("routes").state, "OPEN");
    assert.throws(() => assertBreakerAllows("routes"), (err: unknown) => {
      assert.ok(isOpsGuardError(err));
      assert.equal(err.code, "CIRCUIT_OPEN");
      assert.equal(err.status, 503);
      return true;
    });
    await assert.rejects(
      () => runWithBreaker("routes", async () => "ok"),
      (err: unknown) => {
        assert.ok(isOpsGuardError(err));
        assert.equal(err.code, "CIRCUIT_OPEN");
        return true;
      },
    );
  });

  it("OPEN → HALF_OPEN after openMs then CLOSED after successThreshold", () => {
    let now = 1_000_000;
    setBreakerClockForTests(() => now);
    for (let i = 0; i < CIRCUIT_BREAKER.failureThreshold; i++) {
      recordBreakerFailure("orcarouter");
    }
    assert.equal(getBreakerState("orcarouter").state, "OPEN");

    now += CIRCUIT_BREAKER.openMs - 1;
    assert.throws(() => assertBreakerAllows("orcarouter"));

    now += 1;
    assertBreakerAllows("orcarouter");
    assert.equal(getBreakerState("orcarouter").state, "HALF_OPEN");

    for (let i = 0; i < CIRCUIT_BREAKER.successThreshold - 1; i++) {
      recordBreakerSuccess("orcarouter");
      assert.equal(getBreakerState("orcarouter").state, "HALF_OPEN");
    }
    recordBreakerSuccess("orcarouter");
    assert.equal(getBreakerState("orcarouter").state, "CLOSED");
  });

  it("HALF_OPEN failure returns to OPEN", () => {
    let now = 5_000_000;
    setBreakerClockForTests(() => now);
    for (let i = 0; i < CIRCUIT_BREAKER.failureThreshold; i++) {
      recordBreakerFailure("places");
    }
    now += CIRCUIT_BREAKER.openMs;
    assertBreakerAllows("places");
    assert.equal(getBreakerState("places").state, "HALF_OPEN");
    recordBreakerFailure("places");
    assert.equal(getBreakerState("places").state, "OPEN");
  });

  it("runWithBreaker records success and failure via classify", async () => {
    const ok = await runWithBreaker("places", async () => ({ ok: true }), {
      classify: (r) => (r.ok ? "success" : "failure"),
    });
    assert.deepEqual(ok, { ok: true });
    assert.equal(getBreakerState("places").consecutiveFailures, 0);

    for (let i = 0; i < CIRCUIT_BREAKER.failureThreshold; i++) {
      await runWithBreaker("places", async () => ({ ok: false }), {
        classify: (r) => (r.ok ? "success" : "failure"),
      });
    }
    assert.equal(getBreakerState("places").state, "OPEN");
  });

  it("providers are independent", () => {
    for (let i = 0; i < CIRCUIT_BREAKER.failureThreshold; i++) {
      recordBreakerFailure("places");
    }
    assert.equal(getBreakerState("places").state, "OPEN");
    assert.equal(getBreakerState("routes").state, "CLOSED");
    assertBreakerAllows("routes");
  });
});
