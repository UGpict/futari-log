import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  linkWithCredential,
  signInWithCredential,
  GoogleAuthProvider,
  signOut,
} from "firebase/auth";
import { googleAuthCopy } from "../src/client/auth";

async function authEmulatorReachable(): Promise<boolean> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  try {
    const res = await fetch(`http://${host}/`, { signal: AbortSignal.timeout(800) });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

function applyEmulatorEnv() {
  process.env.USE_FIREBASE_EMULATOR = "true";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  process.env.FIREBASE_PROJECT_ID ??= "demo-futari-log";
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??= "demo-futari-log";
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ??= "fake-api-key-for-emulator";
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??= "localhost";
  process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??= "1:0:web:emulator";
  process.env.DATA_BACKEND ??= "firestore";
  process.env.ENABLE_DEMO_CONTROLS ??= "true";
}

function googleCredential(sub: string, email: string) {
  return GoogleAuthProvider.credential(
    JSON.stringify({
      sub,
      email,
      email_verified: true,
    }),
  );
}

describe("google auth copy", () => {
  it("documents the already-in-use warning for users before switching accounts", () => {
    assert.match(googleAuthCopy.alreadyInUse, /別のアカウント/);
    assert.match(googleAuthCopy.alreadyInUse, /表示されなくなります/);
    assert.match(googleAuthCopy.cookieOnly, /引き継がれません/);
  });
});

describe("google link keeps uid (Auth Emulator)", () => {
  it("links Google to anonymous without changing uid, and session cookie stays on that uid", async (t) => {
    if (!(await authEmulatorReachable())) {
      t.skip("Auth Emulator not running (npm run test:emulator; Java required)");
      return;
    }
    applyEmulatorEnv();
    const { issueSessionFromIdToken, verifyToken } = await import("../src/server/auth/index");

    const appName = `link-${Date.now()}`;
    const app = initializeApp(
      {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: "localhost",
        projectId: process.env.FIREBASE_PROJECT_ID!,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
      },
      appName,
    );
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
      disableWarnings: true,
    });

    try {
      const anon = await signInAnonymously(auth);
      const uidA = anon.user.uid;
      await linkWithCredential(anon.user, googleCredential(`sub-${uidA}`, `${uidA}@example.com`));
      assert.equal(auth.currentUser?.uid, uidA);
      assert.equal(auth.currentUser?.isAnonymous, false);

      const idToken = await auth.currentUser!.getIdToken(true);
      const issued = await issueSessionFromIdToken(idToken);
      assert.ok(issued);
      assert.equal(issued!.uid, uidA);
      assert.equal(await verifyToken(issued!.token), uidA);
    } finally {
      await signOut(auth).catch(() => undefined);
      await deleteApp(app);
    }
  });

  it("detects credential-already-in-use and leaves the anonymous uid unchanged", async (t) => {
    if (!(await authEmulatorReachable())) {
      t.skip("Auth Emulator not running (npm run test:emulator; Java required)");
      return;
    }
    applyEmulatorEnv();

    const appName = `conflict-${Date.now()}`;
    const app = initializeApp(
      {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: "localhost",
        projectId: process.env.FIREBASE_PROJECT_ID!,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
      },
      appName,
    );
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {
      disableWarnings: true,
    });
    const shared = googleCredential("shared-google-sub", "shared@example.com");

    try {
      await signInWithCredential(auth, shared);
      const ownerUid = auth.currentUser!.uid;
      await signOut(auth);

      const anon = await signInAnonymously(auth);
      const uidA = anon.user.uid;
      assert.notEqual(uidA, ownerUid);

      let code: string | null = null;
      try {
        await linkWithCredential(anon.user, shared);
      } catch (error) {
        code = (error as { code?: string }).code ?? null;
      }
      assert.equal(code, "auth/credential-already-in-use");
      assert.equal(auth.currentUser?.uid, uidA);
      assert.equal(auth.currentUser?.isAnonymous, true);
    } finally {
      await signOut(auth).catch(() => undefined);
      await deleteApp(app);
    }
  });
});

describe("firebase emulator backends", () => {
  it("issues anonymous Auth and persists couples when emulator is up", async (t) => {
    if (!(await authEmulatorReachable())) {
      t.skip("Auth Emulator not running (npm run test:emulator; Java required)");
      return;
    }
    applyEmulatorEnv();
    const { getEnv } = await import("../src/config/env");
    const { issueAnonymous, verifyToken } = await import("../src/server/auth/index");
    const { emptyCoupleBundle, loadCouple, putCouple } = await import("../src/server/repositories/store");

    const env = getEnv();
    assert.equal(env.emulator, true);
    assert.equal(env.authBackend, "firebase");
    assert.equal(env.dataBackend, "firestore");

    const { uid, token } = await issueAnonymous();
    assert.ok(uid.length > 0);
    assert.equal(token.startsWith("mock."), false);
    assert.equal(await verifyToken(token), uid);

    const id = `cpl_test_${Date.now()}`;
    await putCouple(
      emptyCoupleBundle({ id, ownerUid: "uid_test", isDemo: true, createdAt: new Date().toISOString() }),
    );
    const found = await loadCouple(id);
    assert.equal(found?.couple.ownerUid, "uid_test");
  });
});
