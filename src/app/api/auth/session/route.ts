import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { sessionAuthRequestSchema } from "@/contracts";
import { readJson } from "@/server/api/http";
import {
  issueSessionFromIdToken,
  sessionCookieOptions,
  tokenCookieName,
} from "@/server/auth";

export async function POST(request: Request) {
  const body = await readJson(request, sessionAuthRequestSchema);
  if ("error" in body) return body.error;

  const issued = await issueSessionFromIdToken(body.data.idToken);
  if (!issued) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const env = getEnv();
  const res = NextResponse.json({
    uid: issued.uid,
    runtime: env.runtime,
    authBackend: env.authBackend,
    dataBackend: env.dataBackend,
    emulator: env.emulator,
    isAnonymous: issued.identity.isAnonymous,
    authProviders: issued.identity.authProviders,
  });
  res.cookies.set(tokenCookieName(), issued.token, sessionCookieOptions(env));
  return res;
}
