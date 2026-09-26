import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEnv,
  getStoreDir,
  runWithEnvScope,
  runWithEnvScopeAsync,
} from "../src/config/env";

describe("runWithEnvScope", () => {
  it("overrides runtime/dataBackend/storeDir without mutating process.env", () => {
    const prevRuntime = process.env.APP_RUNTIME;
    const prevBackend = process.env.DATA_BACKEND;
    const prevStore = process.env.STORE_DIR;

    runWithEnvScope(
      {
        runtime: "MOCK",
        dataBackend: "file",
        storeDir: "/tmp/futari-scope-test",
        enableEventCatalog: false,
      },
      () => {
        assert.equal(getEnv().runtime, "MOCK");
        assert.equal(getEnv().dataBackend, "file");
        assert.equal(getEnv().enableEventCatalog, false);
        assert.equal(getStoreDir(), "/tmp/futari-scope-test");
        assert.equal(process.env.APP_RUNTIME, prevRuntime);
        assert.equal(process.env.DATA_BACKEND, prevBackend);
        assert.equal(process.env.STORE_DIR, prevStore);
      },
    );

    assert.notEqual(getStoreDir(), "/tmp/futari-scope-test");
  });

  it("does not leak overrides to concurrent async work outside the scope", async () => {
    const outside: string[] = [];
    const inside: string[] = [];

    const scoped = runWithEnvScopeAsync(
      { runtime: "MOCK", storeDir: "/tmp/futari-async-scope" },
      async () => {
        inside.push(getEnv().runtime, getStoreDir());
        await new Promise((r) => setTimeout(r, 20));
        inside.push(getEnv().runtime, getStoreDir());
        return "done";
      },
    );

    // Sibling tick outside ALS should see process defaults, not MOCK storeDir.
    await Promise.resolve();
    outside.push(getStoreDir());

    assert.equal(await scoped, "done");
    assert.deepEqual(inside, ["MOCK", "/tmp/futari-async-scope", "MOCK", "/tmp/futari-async-scope"]);
    assert.ok(!outside[0]?.includes("futari-async-scope"));
  });
});
