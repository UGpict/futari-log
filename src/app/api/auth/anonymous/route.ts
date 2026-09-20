import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { issueAnonymous, tokenCookieName } from "@/server/auth";

export async function POST() {
  const env = getEnv();
  const { uid, token } = await issueAnonymous();
  const res = NextResponse.json({
    uid,
    runtime: env.runtime,
    authBackend: env.authBackend,
    dataBackend: env.dataBackend,
    emulator: env.emulator,
  });
  res.cookies.set(tokenCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return res;
}
