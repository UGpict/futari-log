import { json, requireUid, enforceRateLimit } from "@/server/api/http";
import { createSession, listCalendarPlans } from "@/server/api/actions";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const result = await listCalendarPlans(auth.uid, id, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result.data);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const limited = await enforceRateLimit(request, auth.uid, "session_create");
  if ("error" in limited) return limited.error;
  const { id } = await ctx.params;
  const raw = await request.json().catch(() => null);
  const result = await createSession(auth.uid, id, raw);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ sessionId: result.id, input: result.input }, 201);
}
