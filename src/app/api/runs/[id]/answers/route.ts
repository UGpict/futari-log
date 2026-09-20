import { json, requireUid } from "@/server/api/http";
import { answerQuestion } from "@/server/api/actions";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as { questionId?: string; answer?: string };
  if (!body.questionId || !body.answer) return json({ error: "invalid" }, 400);
  const result = await answerQuestion(auth.uid, id, body.questionId, body.answer);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true });
}
