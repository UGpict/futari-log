import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

function requiredPublic(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Firebase client auth`);
  }
  return value;
}

let authEmulatorConnected = false;

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp({
    apiKey: requiredPublic("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: requiredPublic("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: requiredPublic("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    appId: requiredPublic("NEXT_PUBLIC_FIREBASE_APP_ID"),
  });
}

export function getClientAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emulatorHost && !authEmulatorConnected) {
    connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
    authEmulatorConnected = true;
  }
  return auth;
}
