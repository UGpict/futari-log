import { json, requireUid, readJson } from "@/server/api/http";
import { reviseMemory } from "@/server/api/actions";
import { reviseMemoryRequestSchema } from "@/contracts/memory";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, reviseMemoryRequestSchema);
  if ("error" in body) return body.error;
  const result = await reviseMemory(auth.uid, id, body.data.content);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}