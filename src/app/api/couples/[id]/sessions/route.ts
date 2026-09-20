import { json, requireUid } from "@/server/api/http";
import { createSession } from "@/server/api/actions";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const raw = await request.json().catch(() => null);
  const result = await createSession(auth.uid, id, raw);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ sessionId: result.id, input: result.input }, 201);
}