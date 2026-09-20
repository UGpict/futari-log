import { json, requireUid } from "@/server/api/http";
import { createCouple } from "@/server/api/actions";

export async function POST(request: Request) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { isDemo?: boolean };
  const created = await createCouple(auth.uid, body.isDemo !== false);
  return json(created, 201);
}
