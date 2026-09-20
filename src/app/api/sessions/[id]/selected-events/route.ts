import { json, requireUid, readJson } from "@/server/api/http";
import { selectSessionEvents } from "@/server/api/actions";
import { selectEventsRequestSchema, selectEventsResponseSchema } from "@/contracts/catalog";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, selectEventsRequestSchema);
  if ("error" in body) return body.error;
  const result = await selectSessionEvents(auth.uid, id, body.data.eventIds);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(
    selectEventsResponseSchema.parse({
      sessionId: result.sessionId,
      selectedEventIds: result.selectedEventIds,
    }),
  );
}
