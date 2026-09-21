import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";
import { getClientAuth } from "./firebase-app";

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
