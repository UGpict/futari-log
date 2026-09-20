import { json, requireUid, readJson } from "@/server/api/http";
import { answerQuestion } from "@/server/api/actions";
import { answerRequestSchema } from "@/contracts/session";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, answerRequestSchema);
  if ("error" in body) return body.error;
  const result = await answerQuestion(auth.uid, id, body.data.questionId, body.data.answer);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true });
}