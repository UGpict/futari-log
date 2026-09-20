import { PLACES_FIELD_MASK_DETAILS } from "@/config/settings";
import { parsePlaceHours } from "@/server/providers/placeFacts";

/** Places 保存方針。写真リソース名は永続化しない。 */
export const PLACES_PERSIST_POLICY = {
  placeId: { persist: true, maxAgeDays: null as number | null, note: "Place ID は無期限保存可" },
  displayName: { persist: true, maxAgeDays: 30, note: "キャッシュ扱い" },
  location: { persist: true, maxAgeDays: 30, note: "キャッシュ扱い" },
  types: { persist: true, maxAgeDays: 30, note: "キャッシュ扱い" },
  websiteUri: { persist: true, maxAgeDays: 30, note: "キャッシュ扱い" },
  googleMapsUri: { persist: true, maxAgeDays: 30, note: "キャッシュ扱い" },
  regularOpeningHours: { persist: true, maxAgeDays: 30, note: "キャッシュ扱い" },
  photoName: { persist: false, maxAgeDays: 0, note: "写真リソース名は永続化しない" },
} as const;

export type MatchedPlace = {
  placeId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  types: string[];
  websiteUri: string | null;
  googleMapsUri: string | null;
  regularOpeningHours: unknown | null;
  hoursFetchedAt: string | null;
};

export async function matchVenuePlace(input: {
  apiKey: string;
  name: string;
  area: { lat: number; lng: number };
}): Promise<MatchedPlace | null> {
  const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.types,places.googleMapsUri,places.websiteUri",
    },
    body: JSON.stringify({
      textQuery: input.name,
      languageCode: "ja",
      maxResultCount: 3,
      locationBias: {
        circle: {
          center: { latitude: input.area.lat, longitude: input.area.lng },
          radius: 2500,
        },
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!search.ok) return null;
  const data = (await search.json()) as {
    places?: {
      id?: string;
      displayName?: { text?: string };
      location?: { latitude?: number; longitude?: number };
      types?: string[];
      googleMapsUri?: string;
      websiteUri?: string;
    }[];
  };
  const place = data.places?.[0];
  if (!place?.id) return null;

  const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(place.id)}`, {
    headers: {
      "X-Goog-Api-Key": input.apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK_DETAILS,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!details.ok) {
    return {
      placeId: place.id,
      name: place.displayName?.text ?? input.name,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
      types: place.types ?? [],
      websiteUri: place.websiteUri ?? null,
      googleMapsUri: place.googleMapsUri ?? null,
      regularOpeningHours: null,
      hoursFetchedAt: null,
    };
  }
  const p = (await details.json()) as {
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    types?: string[];
    websiteUri?: string;
    googleMapsUri?: string;
    regularOpeningHours?: unknown;
    photos?: unknown;
  };
  void p.photos;
  const hours = parsePlaceHours(
    p.regularOpeningHours as { periods?: { open?: { day?: number } }[] } | null,
  );
  return {
    placeId: p.id ?? place.id,
    name: p.displayName?.text ?? place.displayName?.text ?? input.name,
    lat: p.location?.latitude ?? place.location?.latitude ?? null,
    lng: p.location?.longitude ?? place.location?.longitude ?? null,
    types: p.types ?? place.types ?? [],
    websiteUri: p.websiteUri ?? place.websiteUri ?? null,
    googleMapsUri: p.googleMapsUri ?? place.googleMapsUri ?? null,
    regularOpeningHours: hours.length ? p.regularOpeningHours : null,
    hoursFetchedAt: hours.length ? new Date().toISOString() : null,
  };
}
