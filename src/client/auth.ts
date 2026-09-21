import {
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type AuthError,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getClientAuth } from "./firebase-app";

export type GoogleAuthOutcome =
  | { status: "linked"; uid: string }
  | { status: "signed-in"; uid: string }
  | {
      status: "credential-already-in-use";
      uid: string;
      message: string;
    }
  | {
      status: "cookie-only-warning";
      uid: string | null;
      message: string;
    };

const ALREADY_IN_USE_MESSAGE =
  "この Google アカウントは別のアカウントに紐づいています。そちらでログインすると、この端末でいま見えているデータは表示されなくなります。";

const COOKIE_ONLY_MESSAGE =
  "いまのブラウザには Google に紐づいていないセッションだけがあります。ログインすると新しいアカウントで始まり、いま見えているデータは引き継がれません。";

/** Wait for persisted Firebase Auth state (or null if signed out). */
export function waitForFirebaseUser(timeoutMs = 4000): Promise<User | null> {
  const auth = getClientAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(auth.currentUser);
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

export async function exchangeIdToken(idToken: string): Promise<void> {
  const { api } = await import("./api");
  await api("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

/** Anonymous Firebase user + session cookie. UID stays stable for later Google link. */
export async function startAnonymousFirebaseSession(): Promise<User> {
  const auth = getClientAuth();
  const cred = await signInAnonymously(auth);
  const idToken = await cred.user.getIdToken(true);
  await exchangeIdToken(idToken);
  return cred.user;
}

export async function refreshSessionFromCurrentUser(): Promise<User | null> {
  const user = await waitForFirebaseUser();
  if (!user) return null;
  const idToken = await user.getIdToken();
  await exchangeIdToken(idToken);
  return user;
}

export async function clientSignOut(): Promise<void> {
  const { api } = await import("./api");
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    await signOut(getClientAuth());
  }
}

function isAuthError(error: unknown): error is AuthError {
  return Boolean(error && typeof error === "object" && "code" in error);
}

async function applyCredential(cred: UserCredential): Promise<{ uid: string }> {
  const idToken = await cred.user.getIdToken(true);
  await exchangeIdToken(idToken);
  return { uid: cred.user.uid };
}

/**
 * Start Google login / upgrade.
 * - Anonymous Firebase user → linkWithPopup (UID unchanged)
 * - No Firebase user (cookie-only) → return warning; caller must confirm then continueGoogleSignIn
 * - credential-already-in-use → return warning; caller confirms then signInWithPopup
 */
export async function beginGoogleLogin(): Promise<GoogleAuthOutcome> {
  const auth = getClientAuth();
  const user = await waitForFirebaseUser();
  if (!user) {
    return {
      status: "cookie-only-warning",
      uid: null,
      message: COOKIE_ONLY_MESSAGE,
    };
  }
  if (!user.isAnonymous) {
    const idToken = await user.getIdToken(true);
    await exchangeIdToken(idToken);
    return { status: "signed-in", uid: user.uid };
  }

  const provider = new GoogleAuthProvider();
  try {
    const cred = await linkWithPopup(user, provider);
    const result = await applyCredential(cred);
    return { status: "linked", uid: result.uid };
  } catch (error) {
    if (isAuthError(error) && error.code === "auth/credential-already-in-use") {
      return {
        status: "credential-already-in-use",
        uid: user.uid,
        message: ALREADY_IN_USE_MESSAGE,
      };
    }
    throw error;
  }
}

/** After the user accepts cookie-only or already-in-use warnings. */
export async function continueGoogleSignIn(): Promise<{ uid: string }> {
  const auth = getClientAuth();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return applyCredential(cred);
}

export const googleAuthCopy = {
  alreadyInUse: ALREADY_IN_USE_MESSAGE,
  cookieOnly: COOKIE_ONLY_MESSAGE,
} as const;
