import "./firebase.env";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueAnonymous, verifyToken } from "../src/server/auth/index";
import { withStore } from "../src/server/repositories/store";
import { getEnv } from "../src/config/env";

describe("firebase emulator", () => {
  it("uses firestore + firebase auth backends", () => {
    const env = getEnv();
    assert.equal(env.emulator, true);
    assert.equal(env.authBackend, "firebase");
    assert.equal(env.dataBackend, "firestore");
  });

  it("issues an anonymous Auth user and verifies the cookie", async () => {
    const { uid, token } = await issueAnonymous();
    assert.ok(uid.length > 0);
    assert.equal(token.startsWith("mock."), false);
    const verified = await verifyToken(token);
    assert.equal(verified, uid);
    assert.equal(await verifyToken(`${token}ffff`), null);
  });

  it("persists a couple bundle through Firestore", async () => {
    const id = `cpl_test_${Date.now()}`;
    await withStore((db) => {
      db.couples[id] = {
        couple: { id, ownerUid: "uid_test", isDemo: true, createdAt: new Date().toISOString() },
        memories: {},
        memoryCandidates: {},
        reflections: {},
        approvals: {},
        sessions: {},
        replays: {},
      };
    });
    const found = await withStore((db) => db.couples[id]?.couple.ownerUid ?? null);
    assert.equal(found, "uid_test");
  });
});
