import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import {
  AuthRequestError,
  authCookieOptions,
  signInWithEmailPassword,
  tokenCookieName,
} from "@/server/auth";
import { emailPasswordRequestSchema } from "@/contracts";

export async function POST(request: Request) {
  const parsed = emailPasswordRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "メールアドレスとパスワード（8文字以上）を入力してください。" }, { status: 400 });
  }
  try {
    const env = getEnv();
    const session = await signInWithEmailPassword(parsed.data);
    const res = NextResponse.json({
      uid: session.uid,
      email: session.email,
      emailVerified: session.emailVerified,
      runtime: env.runtime,
      authBackend: env.authBackend,
      dataBackend: env.dataBackend,
      emulator: env.emulator,
    });
    res.cookies.set(tokenCookieName(), session.token, authCookieOptions(env));
    return res;
  } catch (error) {
    if (error instanceof AuthRequestError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "ログインに失敗しました。" }, { status: 500 });
  }
}
