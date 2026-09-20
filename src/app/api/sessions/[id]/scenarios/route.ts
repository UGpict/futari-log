import { json, requireUid } from "@/server/api/http";
import { injectScenario, startRun } from "@/server/api/actions";
import { sha256 } from "@/lib/ids";
import type { ScenarioKind } from "@/domain/schemas";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as {
    kind: ScenarioKind;
    spotId?: string | null;
    legId?: string | null;
    from?: string | null;
    to?: string | null;
    overlay?: Record<string, unknown>;
  };
  const injected = await injectScenario(auth.uid, id, {
    kind: body.kind,
    spotId: body.spotId,
    legId: body.legId,
    from: body.from,
    to: body.to,
    overlay: body.overlay ?? {},
  });
  if (!injected.ok) return json({ error: injected.error }, injected.status);
  const run = await startRun({
    uid: auth.uid,
    sessionId: id,
    kind: "REPLAN",
    trigger: body.kind,
    idempotencyKey: null,
    bodyHash: sha256(JSON.stringify(body)),
  });
  if (!run.ok) return json({ error: run.error, scenarioId: injected.scenarioId }, run.status);
  return json({ scenarioId: injected.scenarioId, runId: run.runId }, 202);
}
