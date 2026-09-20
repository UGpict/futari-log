import { json, requireUid, readJson } from "@/server/api/http";
import { injectScenario, startRun } from "@/server/api/actions";
import { sha256 } from "@/lib/ids";
import { injectScenarioRequestSchema } from "@/contracts/session";
import { dispatchProposal } from "@/server/workflows/dispatch";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, injectScenarioRequestSchema);
  if ("error" in body) return body.error;
  const injected = await injectScenario(auth.uid, id, {
    kind: body.data.kind,
    spotId: body.data.spotId,
    legId: body.data.legId,
    from: body.data.from,
    to: body.data.to,
    overlay: body.data.overlay ?? {},
  });
  if (!injected.ok) return json({ error: injected.error }, injected.status);
  const run = await startRun({
    uid: auth.uid,
    sessionId: id,
    kind: "REPLAN",
    trigger: body.data.kind,
    idempotencyKey: null,
    bodyHash: sha256(JSON.stringify(body.data)),
  });
  if (!run.ok) return json({ error: run.error, scenarioId: injected.scenarioId }, run.status);
  if (!run.duplicated) void dispatchProposal(run.runId, "REPLAN");
  return json({ scenarioId: injected.scenarioId, runId: run.runId }, 202);
}