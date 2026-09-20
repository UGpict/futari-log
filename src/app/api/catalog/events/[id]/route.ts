import { json, requireUid } from "@/server/api/http";
import { getEvent, getVenue } from "@/server/catalog/repo";
import { catalogEventDetailSchema } from "@/contracts/catalog";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const event = await getEvent(id);
  if (!event) return json({ error: "not found" }, 404);
  const venue = event.venueId ? await getVenue(event.venueId) : null;
  return json(
    catalogEventDetailSchema.parse({
      id: event.id,
      title: event.title,
      genre: event.genre,
      venueId: event.venueId,
      venueName: event.venueName,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd,
      fridayClose: event.fields.fridayClose?.value ?? null,
      closedDaysText: event.fields.closedDays?.value ?? null,
      feeText: event.feeText,
      officialUrl: event.officialUrl,
      lat: event.lat,
      lng: event.lng,
      confirmation: event.confirmation,
      sourceUrl: event.sourceUrl,
      sourceTitle: event.sourceTitle,
      fetchedAt: event.fetchedAt,
      planEligible: event.planEligible === true,
      fields: event.fields,
      eventImage: event.eventImage,
      photos: {
        event: event.eventImage,
        venue: venue?.venuePhoto ?? null,
        displayVerified: false,
        note: "写真の取得・表示確認は未実施。photoName は保存しない。event は公式 og:image、venue は Places 帰属のみ。",
      },
    }),
  );
}
