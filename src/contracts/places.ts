import { z } from "zod";

export const placeCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  address: z.string().nullable(),
});
export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

export const placePhotoStateSchema = z.enum(["ready", "none", "failed"]);
export type PlacePhotoState = z.infer<typeof placePhotoStateSchema>;

export const placePhotoAttributionSchema = z.object({
  displayName: z.string().nullable(),
  uri: z.string().nullable(),
  photoUri: z.string().nullable(),
});
export type PlacePhotoAttribution = z.infer<typeof placePhotoAttributionSchema>;

export const placePhotoSchema = z.object({
  placeId: z.string(),
  state: placePhotoStateSchema,
  kind: z.literal("VENUE"),
  source: z.literal("places"),
  imageUrl: z.string().nullable(),
  googleMapsUri: z.string().nullable(),
  authorAttributions: z.array(placePhotoAttributionSchema),
});
export type PlacePhoto = z.infer<typeof placePhotoSchema>;

export const placePhotosResponseSchema = z.object({
  photos: z.array(placePhotoSchema),
});
export type PlacePhotosResponse = z.infer<typeof placePhotosResponseSchema>;

export function isCatalogBackedSpotId(id: string): boolean {
  return id.startsWith("mock:") || id.startsWith("demo:");
}

export function isVenuePlaceId(id: string): boolean {
  if (!id || id.length > 128 || id.includes("/") || id.includes("\\") || /\s/.test(id)) return false;
  return !isCatalogBackedSpotId(id) && !id.startsWith("ven_") && !id.startsWith("evt_");
}

export const placeSearchStateSchema = z.enum(["ok", "empty", "failed"]);
export type PlaceSearchState = z.infer<typeof placeSearchStateSchema>;

export const placeSearchResponseSchema = z.object({
  query: z.string(),
  state: placeSearchStateSchema,
  places: z.array(placeCandidateSchema),
  error: z.string().nullable(),
});
export type PlaceSearchResponse = z.infer<typeof placeSearchResponseSchema>;
