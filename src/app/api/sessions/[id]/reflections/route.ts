import { json, requireUid, readJson, enforceRateLimit } from "@/server/api/http";
import { listSessionReflections, saveReflection } from "@/server/api/actions";
import {
  reflectionListResponseSchema,
  saveReflectionRequestSchema,
  saveReflectionResponseSchema,
} from "@/contracts/reflection";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const result = await listSessionReflections(auth.uid, id);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(reflectionListResponseSchema.parse({ reflections: result.reflections }));
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const limited = await enforceRateLimit(request, auth.uid, "reflect");
  if ("error" in limited) return limited.error;
  const { id } = await ctx.params;
  const body = await readJson(request, saveReflectionRequestSchema);
  if ("error" in body) return body.error;
  const result = await saveReflection(auth.uid, id, body.data);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(
    saveReflectionResponseSchema.parse({
      ok: true,
      reflection: result.reflection,
      analysisEnqueued: result.analysisEnqueued,
    }),
    202,
  );
}
