import { json, requireUid } from "@/server/api/http";
import { searchPlaces } from "@/server/api/actions";

export async function GET(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const latRaw = url.searchParams.get("lat");
  const lngRaw = url.searchParams.get("lng");
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : undefined;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : undefined;
  const result = await searchPlaces(
    auth.uid,
    q,
    lat != null && Number.isFinite(lat) ? lat : undefined,
    lng != null && Number.isFinite(lng) ? lng : undefined,
  );
  if (!result.ok) return json({ error: "search failed" }, 500);
  return json(result.data);
}
