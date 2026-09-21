import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getEnv } from "@/config/env";
import { hmacSha256, newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import { adminAuth } from "@/server/firebase/admin";
import { withStore } from "@/server/repositories/store";

const COOKIE = "futari_token";
const SESSION_MS = 60 * 60 * 24 * 14 * 1000;

export function tokenCookieName() {
  return COOKIE;
}

export function createUid(): string {
  return newId("anon");
}

export function signToken(uid: string): string {
  const env = getEnv();
  const payload = `${uid}.${Date.now()}`;
  return `mock.${payload}.${hmacSha256(env.mockAuthSecret, payload)}`;
}

export function verifyMockToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const env = getEnv();
  const parts = token.split(".");
  if (parts.length < 4 || parts[0] !== "mock") return null;
  const uid = parts[1];
  const ts = parts[2];
  const sig = parts.slice(3).join(".");
  const payload = `${uid}.${ts}`;
  if (hmacSha256(env.mockAuthSecret, payload) !== sig) return null;
  return uid;
}

function identityToolkitUrl(path: string): string {
  const env = getEnv();
  const apiKey = env.firebaseApiKey ?? "fake-api-key-for-emulator";
  const suffix = `identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(apiKey)}`;
  return env.authEmulatorHost ? `http://${env.authEmulatorHost}/${suffix}` : `https://${suffix}`;
}

function hasAdminCredentials(): boolean {
  const env = getEnv();
  if (env.emulator || env.onCloudRun) return true;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) return true;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path && existsSync(path)) return true;
  const unixAdc = join(homedir(), ".config/gcloud/application_default_credentials.json");
  const winAdc = process.env.APPDATA
    ? join(process.env.APPDATA, "gcloud", "application_default_credentials.json")
    : "";
  return existsSync(unixAdc) || (winAdc !== "" && existsSync(winAdc));
}

async function signUpAnonymous(): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(identityToolkitUrl("accounts:signUp"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
    signal: AbortSignal.timeout(15000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    localId?: string;
    idToken?: string;
    error?: { message?: string };
  };
  if (!res.ok || !body.localId || !body.idToken) {
    throw new Error(body.error?.message ?? `anonymous signup HTTP ${res.status}`);
  }
  return { uid: body.localId, idToken: body.idToken };
}

async function lookupUidByIdToken(idToken: string): Promise<string | null> {
  try {
    const res = await fetch(identityToolkitUrl("accounts:lookup"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(10000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      users?: { localId?: string }[];
    };
    return body.users?.[0]?.localId ?? null;
  } catch {
    return null;
  }
}

export async function verifyToken(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  if (token.startsWith("mock.")) return verifyMockToken(token);
  const env = getEnv();
  if (env.authBackend !== "firebase") return null;

  const lookedUp = await lookupUidByIdToken(token);
  if (lookedUp) return lookedUp;
  if (!hasAdminCredentials()) return null;

  try {
    const decoded = await adminAuth().verifySessionCookie(token, true);
    return decoded.uid;
  } catch {
    try {
      const decoded = await adminAuth().verifyIdToken(token, true);
      return decoded.uid;
    } catch {
      return null;
    }
  }
}

type ToolkitAuth = {
  uid: string;
  idToken: string;
  email?: string | null;
  emailVerified?: boolean;
};

type ToolkitErrorBody = {
  localId?: string;
  idToken?: string;
  email?: string;
  emailVerified?: boolean;
  error?: { message?: string };
};

export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AuthRequestError";
  }
}

function mapToolkitError(code: string | undefined, fallback: string): AuthRequestError {
  const normalized = (code ?? "").toUpperCase();
  if (normalized.includes("EMAIL_EXISTS")) {
    return new AuthRequestError("このメールアドレスは既に登録されています。", "EMAIL_EXISTS", 409);
  }
  if (normalized.includes("EMAIL_NOT_FOUND") || normalized.includes("USER_NOT_FOUND")) {
    return new AuthRequestError("メールアドレスまたはパスワードが違います。", "EMAIL_NOT_FOUND", 401);
  }
  if (
    normalized.includes("INVALID_PASSWORD") ||
    normalized.includes("INVALID_LOGIN_CREDENTIALS") ||
    normalized.includes("INVALID_EMAIL")
  ) {
    return new AuthRequestError("メールアドレスまたはパスワードが違います。", "INVALID_CREDENTIALS", 401);
  }
  if (normalized.includes("WEAK_PASSWORD")) {
    return new AuthRequestError("パスワードは8文字以上にしてください。", "WEAK_PASSWORD", 400);
  }
  if (normalized.includes("OPERATION_NOT_ALLOWED") || normalized.includes("PASSWORD_LOGIN_DISABLED")) {
    return new AuthRequestError(
      "メール／パスワードログインが有効になっていません。Firebase Authentication の設定を確認してください。",
      "PASSWORD_LOGIN_DISABLED",
      503,
    );
  }
  if (normalized.includes("TOO_MANY_ATTEMPTS")) {
    return new AuthRequestError("試行回数が多すぎます。しばらくしてから再度お試しください。", "TOO_MANY_ATTEMPTS", 429);
  }
  return new AuthRequestError(fallback, normalized || "AUTH_FAILED", 400);
}

async function toolkitJson(path: string, body: Record<string, unknown>): Promise<ToolkitErrorBody> {
  const res = await fetch(identityToolkitUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as ToolkitErrorBody;
  if (!res.ok) {
    throw mapToolkitError(json.error?.message, json.error?.message ?? `auth HTTP ${res.status}`);
  }
  return json;
}

async function sessionFromIdToken(auth: ToolkitAuth): Promise<{ uid: string; token: string; email: string | null; emailVerified: boolean }> {
  const email = auth.email ?? null;
  const emailVerified = Boolean(auth.emailVerified);
  if (!hasAdminCredentials()) {
    return { uid: auth.uid, token: auth.idToken, email, emailVerified };
  }
  try {
    const token = await adminAuth().createSessionCookie(auth.idToken, { expiresIn: SESSION_MS });
    return { uid: auth.uid, token, email, emailVerified };
  } catch {
    return { uid: auth.uid, token: auth.idToken, email, emailVerified };
  }
}

function mockUidForEmail(email: string): string {
  const env = getEnv();
  return `user_${hmacSha256(env.mockAuthSecret, email.toLowerCase()).slice(0, 20)}`;
}

async function issueMockEmailSession(email: string): Promise<{
  uid: string;
  token: string;
  email: string;
  emailVerified: boolean;
}> {
  const uid = mockUidForEmail(email);
  const token = signToken(uid);
  await withStore((db) => {
    db.tokens[token] = { uid, createdAt: realNowIso() };
  });
  return { uid, token, email, emailVerified: true };
}

export async function issueAnonymous(): Promise<{ uid: string; token: string }> {
  const env = getEnv();
  if (env.authBackend === "firebase") {
    const { uid, idToken } = await signUpAnonymous();
    const session = await sessionFromIdToken({ uid, idToken });
    return { uid: session.uid, token: session.token };
  }

  const uid = createUid();
  const token = signToken(uid);
  await withStore((db) => {
    db.tokens[token] = { uid, createdAt: realNowIso() };
  });
  return { uid, token };
}

export async function signInWithEmailPassword(input: {
  email: string;
  password: string;
}): Promise<{ uid: string; token: string; email: string | null; emailVerified: boolean }> {
  const env = getEnv();
  const email = input.email.trim().toLowerCase();
  if (env.authBackend !== "firebase") {
    return issueMockEmailSession(email);
  }
  const body = await toolkitJson("accounts:signInWithPassword", {
    email,
    password: input.password,
    returnSecureToken: true,
  });
  if (!body.localId || !body.idToken) {
    throw new AuthRequestError("ログインに失敗しました。", "AUTH_FAILED", 401);
  }
  return sessionFromIdToken({
    uid: body.localId,
    idToken: body.idToken,
    email: body.email ?? email,
    emailVerified: body.emailVerified,
  });
}

export async function signUpWithEmailPassword(input: {
  email: string;
  password: string;
}): Promise<{ uid: string; token: string; email: string | null; emailVerified: boolean }> {
  const env = getEnv();
  const email = input.email.trim().toLowerCase();
  if (env.authBackend !== "firebase") {
    return issueMockEmailSession(email);
  }
  const body = await toolkitJson("accounts:signUp", {
    email,
    password: input.password,
    returnSecureToken: true,
  });
  if (!body.localId || !body.idToken) {
    throw new AuthRequestError("アカウント作成に失敗しました。", "AUTH_FAILED", 400);
  }
  try {
    await toolkitJson("accounts:sendOobCode", {
      requestType: "VERIFY_EMAIL",
      idToken: body.idToken,
    });
  } catch {
    // 確認メール送信失敗でもセッションは発行する（再送可能）
  }
  return sessionFromIdToken({
    uid: body.localId,
    idToken: body.idToken,
    email: body.email ?? email,
    emailVerified: body.emailVerified,
  });
}

export async function sendPasswordResetEmail(emailRaw: string): Promise<void> {
  const env = getEnv();
  const email = emailRaw.trim().toLowerCase();
  if (env.authBackend !== "firebase") return;
  await toolkitJson("accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email,
  });
}

async function idTokenForUid(uid: string, existingToken?: string | null): Promise<string | null> {
  if (existingToken && !existingToken.startsWith("mock.")) {
    // セッション Cookie でない idToken の場合に備える
    const lookedUp = await lookupUidByIdToken(existingToken);
    if (lookedUp === uid) return existingToken;
  }
  if (!hasAdminCredentials()) return null;
  const custom = await adminAuth().createCustomToken(uid);
  const body = await toolkitJson("accounts:signInWithCustomToken", {
    token: custom,
    returnSecureToken: true,
  });
  return body.idToken ?? null;
}

export async function getEmailVerificationStatus(token: string | null | undefined): Promise<{
  email: string | null;
  emailVerified: boolean;
}> {
  const uid = await verifyToken(token);
  if (!uid) throw new AuthRequestError("ログインが必要です。", "UNAUTHENTICATED", 401);
  const env = getEnv();
  if (env.authBackend !== "firebase" || token?.startsWith("mock.")) {
    return { email: null, emailVerified: true };
  }
  if (hasAdminCredentials()) {
    const user = await adminAuth().getUser(uid);
    return { email: user.email ?? null, emailVerified: Boolean(user.emailVerified) };
  }
  const idToken = await idTokenForUid(uid, token);
  if (!idToken) return { email: null, emailVerified: false };
  const body = await toolkitJson("accounts:lookup", { idToken });
  const user = (body as { users?: { email?: string; emailVerified?: boolean }[] }).users?.[0];
  return { email: user?.email ?? null, emailVerified: Boolean(user?.emailVerified) };
}

export async function resendEmailVerification(token: string | null | undefined): Promise<void> {
  const uid = await verifyToken(token);
  if (!uid) throw new AuthRequestError("ログインが必要です。", "UNAUTHENTICATED", 401);
  const env = getEnv();
  if (env.authBackend !== "firebase" || token?.startsWith("mock.")) return;
  const idToken = await idTokenForUid(uid, token);
  if (!idToken) {
    throw new AuthRequestError("確認メールを送れませんでした。", "VERIFY_RESEND_FAILED", 500);
  }
  await toolkitJson("accounts:sendOobCode", {
    requestType: "VERIFY_EMAIL",
    idToken,
  });
}

export function authCookieOptions(env: { cookieSecure: boolean }) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.cookieSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export function demoAllowed(uid: string): boolean {
  const env = getEnv();
  if (!env.enableDemoControls) return false;
  if (env.runtime === "MOCK") return true;
  if (env.demoAllowedUids.includes("*")) return true;
  return env.demoAllowedUids.includes(uid);
}
