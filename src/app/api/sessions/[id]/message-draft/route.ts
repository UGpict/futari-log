import { json, requireUid } from "@/server/api/http";
import { messageDraft } from "@/server/api/actions";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const result = await messageDraft(auth.uid, id);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}
