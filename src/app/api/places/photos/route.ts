import { json, requireUid } from "@/server/api/http";
import { listPlacePhotos } from "@/server/api/actions";

export async function GET(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const result = await listPlacePhotos(auth.uid, ids);
  return json(result.data);
}
