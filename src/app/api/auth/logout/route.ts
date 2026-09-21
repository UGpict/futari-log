import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { tokenCookieName } from "@/server/auth";

export async function POST() {
  const env = getEnv();
  const res = NextResponse.json({ ok: true as const });
  res.cookies.set(tokenCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    path: "/",
    maxAge: 0,
  });
  return res;
}
