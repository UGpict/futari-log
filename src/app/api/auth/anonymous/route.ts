import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { authCookieOptions, issueAnonymous, tokenCookieName } from "@/server/auth";

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
  res.cookies.set(tokenCookieName(), token, authCookieOptions(env));
  return res;
}
