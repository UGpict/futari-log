import { json, requireUid, idempotencyKey } from "@/server/api/http";
import { getSessionSnapshot, startRun } from "@/server/api/actions";
import { sha256 } from "@/lib/ids";
import type { RunKind } from "@/domain/schemas";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const result = await getSessionSnapshot(auth.uid, id);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result.data);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as { kind?: RunKind; trigger?: string };
  const kind = body.kind ?? "INITIAL_PLAN";
  const result = await startRun({
    uid: auth.uid,
    sessionId: id,
    kind,
    trigger: body.trigger ?? null,
    idempotencyKey: idempotencyKey(request),
    bodyHash: sha256(JSON.stringify({ kind, trigger: body.trigger ?? null })),
  });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ runId: result.runId }, 202);
}
