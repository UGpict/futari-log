import { json, requireUid, readJson } from "@/server/api/http";
import { decideApprovalChange } from "@/server/api/actions";
import { approvalChangeDecisionRequestSchema } from "@/contracts/session";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await readJson(request, approvalChangeDecisionRequestSchema);
  if ("error" in body) return body.error;
  const result = await decideApprovalChange(auth.uid, id, body.data);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({
    ok: true,
    approval: result.approval,
    planVersion: result.planVersion,
    remaining: result.remaining,
  });
}
