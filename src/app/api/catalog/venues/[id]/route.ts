import { json, requireUid } from "@/server/api/http";
import { getVenue } from "@/server/catalog/repo";
import { catalogVenueDetailSchema } from "@/contracts/catalog";

export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const venue = await getVenue(id);
  if (!venue) return json({ error: "not found" }, 404);
  return json(
    catalogVenueDetailSchema.parse({
      id: venue.id,
      name: venue.name,
      placeId: venue.placeId,
      lat: venue.lat,
      lng: venue.lng,
      types: venue.types,
      websiteUri: venue.websiteUri,
      googleMapsUri: venue.googleMapsUri,
      hoursFetchedAt: venue.hoursFetchedAt,
      hasOpeningHours: Boolean(venue.regularOpeningHours),
      venuePhoto: venue.venuePhoto,
      fetchedAt: venue.fetchedAt,
      confirmation: venue.confirmation,
    }),
  );
}
