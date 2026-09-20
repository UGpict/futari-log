import { json, requireUid } from "@/server/api/http";
import { getRunView } from "@/server/api/actions";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const result = await getRunView(auth.uid, id);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}
