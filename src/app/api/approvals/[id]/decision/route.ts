import { json, requireUid } from "@/server/api/http";
import { decideApproval } from "@/server/api/actions";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = (await request.json()) as { decision?: "APPROVE" | "REJECT" };
  if (body.decision !== "APPROVE" && body.decision !== "REJECT") {
    return json({ error: "invalid" }, 400);
  }
  const result = await decideApproval(auth.uid, id, body.decision);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ ok: true, approval: result.approval });
}
