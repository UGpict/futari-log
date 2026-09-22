import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  fetchOrcaWithRetry,
  ORCA_RETRY_AFTER_MAX_MS,
  parseRetryAfterMs,
  retryDelayMsForStatus,
} from "../src/server/llm/fetchOrcaWithRetry";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
});

describe("parseRetryAfterMs / retryDelayMsForStatus", () => {
  it("parses Retry-After seconds and caps 429 delay", () => {
    assert.equal(parseRetryAfterMs("1"), 1000);
    assert.equal(retryDelayMsForStatus(429, "1"), 1000);
    assert.equal(retryDelayMsForStatus(429, String(ORCA_RETRY_AFTER_MAX_MS / 1000 + 1)), null);
    assert.equal(retryDelayMsForStatus(503, null), 500);
    assert.equal(retryDelayMsForStatus(400, "1"), null);
  });
});

describe("fetchOrcaWithRetry", () => {
  it("429 + Retry-After:1 retries once then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("rate limited", { status: 429, headers: { "Retry-After": "1" } });
      }
      return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;

    const started = Date.now();
    const { response, retries, lastStatus } = await fetchOrcaWithRetry("https://api.example/v1/x", {
      method: "POST",
    });
    assert.equal(response.status, 200);
    assert.equal(retries, 1);
    assert.equal(lastStatus, 200);
    assert.equal(calls, 2);
    assert.ok(Date.now() - started >= 900);
  });

  it("429 + Retry-After:30 does not retry", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      return new Response("", { status: 429, headers: { "Retry-After": "30" } });
    }) as typeof fetch;

    const { response, retries, lastStatus } = await fetchOrcaWithRetry("https://api.example/v1/x", {
      method: "GET",
    });
    assert.equal(response.status, 429);
    assert.equal(retries, 0);
    assert.equal(lastStatus, 429);
    assert.equal(calls, 1);
  });

  it("503 waits 500ms and retries once", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      if (calls === 1) return new Response("", { status: 503 });
      return new Response("ok", { status: 200 });
    }) as typeof fetch;

    const started = Date.now();
    const { response, retries } = await fetchOrcaWithRetry("https://api.example/v1/x", { method: "GET" });
    assert.equal(response.status, 200);
    assert.equal(retries, 1);
    assert.equal(calls, 2);
    assert.ok(Date.now() - started >= 450);
  });

  it("400 does not retry", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      return new Response("bad", { status: 400 });
    }) as typeof fetch;

    const { response, retries } = await fetchOrcaWithRetry("https://api.example/v1/x", { method: "GET" });
    assert.equal(response.status, 400);
    assert.equal(retries, 0);
    assert.equal(calls, 1);
  });

  it("aborts during gateway retry wait", async () => {
    let calls = 0;
    const ac = new AbortController();
    globalThis.fetch = mock.fn(async () => {
      calls += 1;
      return new Response("", { status: 503 });
    }) as typeof fetch;

    const p = fetchOrcaWithRetry("https://api.example/v1/x", { method: "GET", signal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    await assert.rejects(p, (err: unknown) => {
      return err instanceof DOMException && err.name === "AbortError";
    });
    assert.equal(calls, 1);
  });
});
