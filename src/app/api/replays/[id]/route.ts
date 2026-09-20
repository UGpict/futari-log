import { json, requireUid } from "@/server/api/http";
import { withStore } from "@/server/repositories/store";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const result = await withStore((db) => {
    for (const couple of Object.values(db.couples)) {
      if (couple.couple.ownerUid !== auth.uid) continue;
      const replay = couple.replays[id];
      if (replay) return { ok: true as const, replay };
    }
    return { ok: false as const, status: 404 as const, error: "not found" };
  });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}
