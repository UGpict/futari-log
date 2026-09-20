import { NextResponse } from "next/server";
import { issueAnonymous, tokenCookieName } from "@/server/auth";

export async function POST() {
  const { uid, token } = await issueAnonymous();
  const res = NextResponse.json({ uid, runtime: "MOCK" });
  res.cookies.set(tokenCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
