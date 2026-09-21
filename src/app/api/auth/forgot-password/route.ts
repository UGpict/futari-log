import { NextResponse } from "next/server";
import { getEnv } from "@/config/env";
import { AuthRequestError, sendPasswordResetEmail } from "@/server/auth";
import { emailOnlyRequestSchema } from "@/contracts";

export async function POST(request: Request) {
  const parsed = emailOnlyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "メールアドレスを入力してください。" }, { status: 400 });
  }
  try {
    await sendPasswordResetEmail(parsed.data.email);
    // 登録有無を推測させない
    return NextResponse.json({
      ok: true,
      runtime: getEnv().runtime,
    });
  } catch (error) {
    if (error instanceof AuthRequestError) {
      // EMAIL_NOT_FOUND でも成功扱いにして情報漏洩を避ける
      if (error.code === "EMAIL_NOT_FOUND") {
        return NextResponse.json({ ok: true, runtime: getEnv().runtime });
      }
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "再設定メールを送れませんでした。" }, { status: 500 });
  }
}
