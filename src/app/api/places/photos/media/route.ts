import { json, requireUid } from "@/server/api/http";
import { getPlacePhotoMedia } from "@/server/api/actions";

export async function GET(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const placeId = new URL(request.url).searchParams.get("placeId") ?? "";
  const result = await getPlacePhotoMedia(auth.uid, placeId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return new Response(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
    },
  });
}
