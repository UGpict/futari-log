import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { getEnv } from "@/config/env";

let app: App | null = null;

function credentialFromEnv() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    return cert(JSON.parse(json) as Parameters<typeof cert>[0]);
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) {
    return cert(JSON.parse(readFileSync(path, "utf8")) as Parameters<typeof cert>[0]);
  }
  return applicationDefault();
}

function emulatorCredential(projectId: string) {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return cert({
    projectId,
    clientEmail: `emu@${projectId}.iam.gserviceaccount.com`,
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  });
}

export function getFirebaseApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const env = getEnv();
  const projectId = env.firebaseProjectId ?? "demo-futari-log";
  process.env.GCLOUD_PROJECT ??= projectId;
  process.env.GOOGLE_CLOUD_PROJECT ??= projectId;
  if (env.emulator) {
    app = initializeApp({
      projectId,
      credential: emulatorCredential(projectId),
    });
  } else {
    app = initializeApp({
      projectId,
      credential: credentialFromEnv(),
    });
  }
  return app;
}

export function adminAuth(): Auth {
  return getAuth(getFirebaseApp());
}

let firestore: Firestore | null = null;

export function adminDb(): Firestore {
  if (firestore) return firestore;
  firestore = getFirestore(getFirebaseApp());
  try {
    firestore.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* already initialized */
  }
  return firestore;
}
