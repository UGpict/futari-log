process.env.APP_RUNTIME = "MOCK";
process.env.DATA_BACKEND = "file";
process.env.USE_FIREBASE_EMULATOR = "false";

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { getEnv } from "../src/config/env";
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
  sendPasswordResetEmail,
  verifyToken,
} from "../src/server/auth";

describe("email auth (mock backend)", () => {
  beforeEach(() => {
    process.env.AUTH_BACKEND = "mock";
    process.env.USE_FIREBASE_EMULATOR = "false";
    assert.equal(getEnv().authBackend, "mock");
  });

  it("signs up and verifies a session token", async () => {
    const session = await signUpWithEmailPassword({
      email: "pair@example.com",
      password: "password1",
    });
    assert.ok(session.uid.startsWith("user_"));
    assert.equal(session.email, "pair@example.com");
    assert.equal(await verifyToken(session.token), session.uid);
  });

  it("signs in the same email to a stable uid", async () => {
    const a = await signInWithEmailPassword({
      email: "stable@example.com",
      password: "password1",
    });
    const b = await signInWithEmailPassword({
      email: "STABLE@example.com",
      password: "anything12",
    });
    assert.equal(a.uid, b.uid);
  });

  it("accepts password reset without throwing on mock", async () => {
    await sendPasswordResetEmail("reset@example.com");
  });
});
