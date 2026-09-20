import { json, requireUid, idempotencyKey, readJson } from "@/server/api/http";
import { getSessionSnapshot, startRun } from "@/server/api/actions";
import { sha256 } from "@/lib/ids";
import { startRunRequestSchema } from "@/contracts/session";
import { kickRun } from "@/server/workflows/dispatch";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
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
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, startRunRequestSchema);
  if ("error" in body) return body.error;
  const kind = body.data.kind ?? "INITIAL_PLAN";
  const trigger = body.data.trigger ?? null;
  const instruction = body.data.instruction ?? null;
  const targetPlanItemId = body.data.targetPlanItemId ?? null;
  const basePlanVersion = body.data.basePlanVersion ?? null;
  const result = await startRun({
    uid: auth.uid,
    sessionId: id,
    kind,
    trigger,
    instruction,
    targetPlanItemId,
    basePlanVersion,
    idempotencyKey: idempotencyKey(request),
    bodyHash: sha256(JSON.stringify({ kind, trigger, instruction, targetPlanItemId, basePlanVersion })),
  });
  if (!result.ok) return json({ error: result.error }, result.status);
  if (!result.duplicated) kickRun(result.runId, kind);
  return json({ runId: result.runId }, 202);
}