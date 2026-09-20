import {
  PLACE_PHOTO_FAIL_LIMIT,
  PLACE_PHOTO_MAX_IDS,
  PLACE_PHOTO_MAX_PX,
  PLACE_PHOTO_NAME_RETRY,
  PLACES_FIELD_MASK_PHOTOS,
} from "@/config/settings";
import { isVenuePlaceId, type PlacePhoto } from "@/contracts/places";

type FetchLike = typeof fetch;

type PlacePhotoDetails = {
  id?: string;
  googleMapsUri?: string;
  photos?: {
    name?: string;
    googleMapsUri?: string;
    authorAttributions?: { displayName?: string; uri?: string; photoUri?: string }[];
  }[];
};

const failCounts = new Map<string, number>();

export function resetPlacePhotoFailures() {
  failCounts.clear();
}

function blocked(placeId: string): boolean {
  return (failCounts.get(placeId) ?? 0) >= PLACE_PHOTO_FAIL_LIMIT;
}

function markFailure(placeId: string) {
  failCounts.set(placeId, (failCounts.get(placeId) ?? 0) + 1);
}

function markSuccess(placeId: string) {
  failCounts.delete(placeId);
}

function emptyPhoto(placeId: string, state: PlacePhoto["state"]): PlacePhoto {
  return {
    placeId,
    state,
    kind: "VENUE",
    source: "places",
    imageUrl: null,
    googleMapsUri: null,
    authorAttributions: [],
  };
}

function attributionUri(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

async function fetchPhotoDetails(
  apiKey: string,
  placeId: string,
  fetchImpl: FetchLike,
): Promise<PlacePhotoDetails | "failed"> {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK_PHOTOS,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return "failed";
  return (await res.json()) as PlacePhotoDetails;
}

function mediaUrl(photoName: string): string {
  const trimmed = photoName.replace(/^\/+/, "");
  return `https://places.googleapis.com/v1/${trimmed}/media?maxWidthPx=${PLACE_PHOTO_MAX_PX}&maxHeightPx=400`;
}

export async function listVenuePhotos(input: {
  apiKey: string;
  placeIds: string[];
  fetchImpl?: FetchLike;
}): Promise<PlacePhoto[]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const ids = [...new Set(input.placeIds)].slice(0, PLACE_PHOTO_MAX_IDS);
  const photos: PlacePhoto[] = [];
  for (const placeId of ids) {
    if (!isVenuePlaceId(placeId)) {
      photos.push(emptyPhoto(placeId, "none"));
      continue;
    }
    if (blocked(placeId)) {
      photos.push(emptyPhoto(placeId, "failed"));
      continue;
    }
    try {
      const details = await fetchPhotoDetails(input.apiKey, placeId, fetchImpl);
      if (details === "failed") {
        markFailure(placeId);
        photos.push(emptyPhoto(placeId, "failed"));
        continue;
      }
      const first = details.photos?.[0];
      if (!first?.name) {
        markSuccess(placeId);
        photos.push({
          ...emptyPhoto(placeId, "none"),
          googleMapsUri: details.googleMapsUri ?? null,
        });
        continue;
      }
      markSuccess(placeId);
      photos.push({
        placeId,
        state: "ready",
        kind: "VENUE",
        source: "places",
        imageUrl: `/api/places/photos/media?placeId=${encodeURIComponent(placeId)}`,
        googleMapsUri: first.googleMapsUri ?? details.googleMapsUri ?? null,
        authorAttributions: (first.authorAttributions ?? []).map((row) => ({
          displayName: row.displayName ?? null,
          uri: attributionUri(row.uri),
          photoUri: attributionUri(row.photoUri),
        })),
      });
    } catch {
      markFailure(placeId);
      photos.push(emptyPhoto(placeId, "failed"));
    }
  }
  return photos;
}

export async function loadVenuePhotoMedia(input: {
  apiKey: string;
  placeId: string;
  fetchImpl?: FetchLike;
}): Promise<{ state: "ready"; bytes: Uint8Array; contentType: string } | { state: "none" } | { state: "failed" }> {
  if (!isVenuePlaceId(input.placeId) || blocked(input.placeId)) {
    return { state: !isVenuePlaceId(input.placeId) ? "none" : "failed" };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  for (let attempt = 0; attempt <= PLACE_PHOTO_NAME_RETRY; attempt += 1) {
    try {
      const details = await fetchPhotoDetails(input.apiKey, input.placeId, fetchImpl);
      if (details === "failed") {
        if (attempt === PLACE_PHOTO_NAME_RETRY) {
          markFailure(input.placeId);
          return { state: "failed" };
        }
        continue;
      }
      const name = details.photos?.[0]?.name;
      if (!name) {
        markSuccess(input.placeId);
        return { state: "none" };
      }
      const media = await fetchImpl(mediaUrl(name), {
        headers: { "X-Goog-Api-Key": input.apiKey },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (media.ok) {
        markSuccess(input.placeId);
        return {
          state: "ready",
          bytes: new Uint8Array(await media.arrayBuffer()),
          contentType: media.headers.get("content-type") ?? "image/jpeg",
        };
      }
      if ((media.status === 400 || media.status === 404) && attempt < PLACE_PHOTO_NAME_RETRY) {
        continue;
      }
      markFailure(input.placeId);
      return { state: "failed" };
    } catch {
      if (attempt === PLACE_PHOTO_NAME_RETRY) {
        markFailure(input.placeId);
        return { state: "failed" };
      }
    }
  }
  markFailure(input.placeId);
  return { state: "failed" };
}
