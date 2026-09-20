import { json, requireUid, readJson } from "@/server/api/http";
import { updateProgress } from "@/server/api/actions";
import { progressRequestSchema } from "@/contracts/session";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, progressRequestSchema);
  if ("error" in body) return body.error;
  const result = await updateProgress(auth.uid, id, {
    confirm: body.data.confirm,
    itemId: body.data.itemId,
    progress: body.data.progress,
    status: body.data.status as "CONFIRMED" | "IN_PROGRESS" | "DONE" | undefined,
    location: body.data.location
      ? {
          lat: body.data.location.lat,
          lng: body.data.location.lng,
          label: body.data.location.label ?? null,
        }
      : undefined,
  });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}