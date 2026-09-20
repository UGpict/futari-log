import { json, requireUid } from "@/server/api/http";
import { listEvents } from "@/server/catalog/repo";
import { catalogEventListResponseSchema } from "@/contracts/catalog";

export async function GET(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const url = new URL(request.url);
  const events = await listEvents({
    dateTokyo: url.searchParams.get("date") ?? undefined,
    genre: url.searchParams.get("genre") ?? undefined,
    areaName: url.searchParams.get("area") ?? undefined,
  });
  return json(
    catalogEventListResponseSchema.parse({
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        genre: e.genre,
        venueId: e.venueId,
        venueName: e.venueName,
        dateStart: e.dateStart,
        dateEnd: e.dateEnd,
        confirmation: e.confirmation,
        sourceUrl: e.sourceUrl,
        fetchedAt: e.fetchedAt,
        planEligible: e.planEligible === true,
      })),
      fetchedAt: events[0]?.fetchedAt ?? null,
    }),
  );
}
