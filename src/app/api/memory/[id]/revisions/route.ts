import { json, requireUid } from "@/server/api/http";
import { reviseMemory } from "@/server/api/actions";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as { content?: string };
  if (!body.content) return json({ error: "content required" }, 400);
  const result = await reviseMemory(auth.uid, id, body.content);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}
