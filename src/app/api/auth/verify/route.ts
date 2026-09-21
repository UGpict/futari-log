import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AuthRequestError,
  getEmailVerificationStatus,
  resendEmailVerification,
  tokenCookieName,
} from "@/server/auth";

export async function GET() {
  try {
    const jar = await cookies();
    const status = await getEmailVerificationStatus(jar.get(tokenCookieName())?.value);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof AuthRequestError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "確認状態を取得できませんでした。" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const jar = await cookies();
    await resendEmailVerification(jar.get(tokenCookieName())?.value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthRequestError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "確認メールを再送できませんでした。" }, { status: 500 });
  }
}
