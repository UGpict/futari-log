import { json, requireUid } from "@/server/api/http";
import { demoReset } from "@/server/api/actions";

export async function POST(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { keepReplays?: boolean };
  const result = await demoReset(auth.uid, body.keepReplays !== false);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json(result);
}
