import { getEnv } from "@/config/env";
import type { Evidence, Spot } from "@/domain/schemas";
import { newId } from "@/lib/ids";
import { realNowIso } from "@/lib/time";
import type { ProviderCtx } from "./types";

export type PhotoAttribution = { displayName: string; uri: string | null };

export type PlacePhotoRef = {
  name: string;
  attributions: PhotoAttribution[];
};

type PlacePhotoJson = {
  name?: string;
  authorAttributions?: { displayName?: string; uri?: string | null }[];
};

export function parsePhotoAttributions(
  photos: PlacePhotoJson[] | undefined,
): PhotoAttribution[] {
  const first = photos?.[0];
  return (first?.authorAttributions ?? [])
    .map((a) => ({
      displayName: (a.displayName ?? "").trim(),
      uri: a.uri?.trim() || null,
    }))
    .filter((a) => a.displayName.length > 0);
}

export function firstPhotoRef(
  photos: PlacePhotoJson[] | undefined,
): PlacePhotoRef | null {
  const name = photos?.[0]?.name?.trim();
  if (!name) return null;
  return { name, attributions: parsePhotoAttributions(photos) };
}

export function applyPhotoMeta(
  spot: Spot,
  ref: PlacePhotoRef | null,
  mapsUri?: string | null,
): Spot {
  if (!ref) return spot;
  return {
    ...spot,
    photoName: ref.name,
    imageAttributions: ref.attributions,
    imageSourceUrl: spot.imageSourceUrl ?? mapsUri ?? null,
    imageProvider: spot.imageProvider ?? "places",
  };
}

export async function resolvePhotoMedia(
  ctx: ProviderCtx,
  apiKey: string,
  photoName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  ctx.httpAttempts += 1;
  await ctx.onHttp({ provider: "places-photo", cacheHit: false, attempt: ctx.httpAttempts });
  const res = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
    {
      headers: { "X-Goog-Api-Key": apiKey },
      signal: signal ?? AbortSignal.timeout(8000),
    },
  );
  if (!res.ok) return null;
  const body = (await res.json().catch(() => ({}))) as { photoUri?: string };
  const uri = body.photoUri?.trim() ?? "";
  if (!uri.startsWith("https://")) return null;
  return uri;
}

export async function hydratePlacePhotos(
  ctx: ProviderCtx,
  spots: Record<string, Spot>,
  signal?: AbortSignal,
): Promise<{ spots: Record<string, Spot>; evidence: Evidence[] }> {
  const env = getEnv();
  const apiKey = env.googleMapsApiKey;
  const next = { ...spots };
  const evidence: Evidence[] = [];
  if (!apiKey) return { spots: next, evidence };

  const targets = Object.values(next)
    .filter((s) => !s.imageUrl && !s.id.startsWith("mock:"))
    .slice(0, 6);

  for (const spot of targets) {
    let photoName = spot.photoName ?? null;
    let attributions = spot.imageAttributions ?? [];
    let mapsUri = spot.imageSourceUrl ?? null;

    if (!photoName) {
      ctx.httpAttempts += 1;
      await ctx.onHttp({ provider: "places", cacheHit: false, attempt: ctx.httpAttempts });
      const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(spot.id)}`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,photos.name,photos.authorAttributions,googleMapsUri",
        },
        signal: signal ?? AbortSignal.timeout(8000),
      });
      if (!details.ok) continue;
      const body = (await details.json()) as {
        photos?: PlacePhotoJson[];
        googleMapsUri?: string;
      };
      const ref = firstPhotoRef(body.photos);
      if (!ref) continue;
      photoName = ref.name;
      attributions = ref.attributions;
      mapsUri = body.googleMapsUri ?? mapsUri;
    }

    const photoUri = await resolvePhotoMedia(ctx, apiKey, photoName, signal);
    if (!photoUri) continue;
    next[spot.id] = {
      ...spot,
      photoName,
      imageUrl: photoUri,
      imageSourceUrl: mapsUri ?? photoUri,
      imageProvider: "places",
      imageAttributions: attributions,
    };
    evidence.push({
      id: newId("ev"),
      kind: "API",
      provider: "places",
      sourceRef: spot.id,
      sourceField: "photos.media",
      fetchedAt: realNowIso(),
      validFor: null,
      note: attributions.length
        ? `Place Photos（店舗ID ${spot.id}）。撮影: ${attributions.map((a) => a.displayName).join(", ")}`
        : `Place Photos（店舗ID ${spot.id}）`,
    });
  }

  return { spots: next, evidence };
}
