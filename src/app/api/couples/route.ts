import { json, requireUid, readJson } from "@/server/api/http";
import { createCouple } from "@/server/api/actions";
import { createCoupleRequestSchema } from "@/contracts/planning";

export async function POST(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const body = await readJson(request, createCoupleRequestSchema);
  if ("error" in body) return body.error;
  const created = await createCouple(auth.uid, body.data.isDemo !== false);
  return json(created, 201);
}