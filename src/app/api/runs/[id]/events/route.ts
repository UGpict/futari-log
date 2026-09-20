import { json, requireUid } from "@/server/api/http";
import { getRunView } from "@/server/api/actions";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const result = await getRunView(auth.uid, id);
  if (!result.ok) return json({ error: result.error }, result.status);
  const url = new URL(request.url);
  const after = Number(url.searchParams.get("after") ?? "-1");
  const events = result.events.filter((e) => e.seq > after);
  return json({ run: result.run, events });
}
