import { createPublicKey, createVerify } from "node:crypto";

type GoogleCerts = { keys?: { kid?: string; kty?: string; n?: string; e?: string; alg?: string }[] };

let cachedCerts: { at: number; keys: GoogleCerts["keys"] } | null = null;

async function googleCerts(): Promise<NonNullable<GoogleCerts["keys"]>> {
  if (cachedCerts && Date.now() - cachedCerts.at < 60 * 60_000 && cachedCerts.keys?.length) {
    return cachedCerts.keys;
  }
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("certs fetch failed");
  const json = (await res.json()) as GoogleCerts;
  cachedCerts = { at: Date.now(), keys: json.keys ?? [] };
  return cachedCerts.keys ?? [];
}

function b64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(padded, "base64");
}

export async function verifyGoogleIdToken(input: {
  token: string;
  audience: string;
  email?: string | null;
}): Promise<{ email: string } | null> {
  const parts = input.token.split(".");
  if (parts.length !== 3) return null;
  const header = JSON.parse(b64url(parts[0]).toString("utf8")) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") return null;
  const payload = JSON.parse(b64url(parts[1]).toString("utf8")) as {
    iss?: string;
    aud?: string | string[];
    exp?: number;
    email?: string;
    email_verified?: boolean | string;
  };
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ""];
  if (!aud.includes(input.audience)) return null;
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") return null;
  if (!payload.exp || payload.exp * 1000 < Date.now() - 30_000) return null;
  const email = payload.email ?? "";
  if (!email.endsWith(".iam.gserviceaccount.com")) return null;
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;
  if (input.email && email !== input.email) return null;

  const keys = await googleCerts();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk?.n || !jwk.e) return null;
  const key = createPublicKey({
    key: { kty: "RSA", n: jwk.n, e: jwk.e },
    format: "jwk",
  });
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${parts[0]}.${parts[1]}`);
  const ok = verifier.verify(key, b64url(parts[2]));
  return ok ? { email } : null;
}
