import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withTimeout } from "../src/lib/abort";

describe("withTimeout", () => {
  it("aborts on timeout even when a non-aborted caller signal is passed", async () => {
    const caller = new AbortController();
    const combined = withTimeout(caller.signal, 30);
    assert.equal(combined.aborted, false);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout did not fire")), 200);
      combined.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    assert.equal(combined.aborted, true);
    assert.equal(caller.signal.aborted, false);
    assert.equal(combined.reason?.name, "TimeoutError");
  });

  it("aborts immediately when the caller signal is already aborted", () => {
    const caller = new AbortController();
    caller.abort();
    const combined = withTimeout(caller.signal, 60_000);
    assert.equal(combined.aborted, true);
  });

  it("uses only the timeout when no caller signal is given", async () => {
    const combined = withTimeout(undefined, 20);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout did not fire")), 200);
      combined.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    assert.equal(combined.aborted, true);
    assert.equal(combined.reason?.name, "TimeoutError");
  });
});
