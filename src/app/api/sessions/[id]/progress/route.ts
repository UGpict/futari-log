import { json, requireUid } from "@/server/api/http";
import { updateProgress } from "@/server/api/actions";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await request.json();
  const result = await updateProgress(auth.uid, id, body);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}
