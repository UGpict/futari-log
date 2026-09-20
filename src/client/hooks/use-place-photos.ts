"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/client/api";
import { isVenuePlaceId, type PlacePhoto, type PlacePhotosResponse } from "@/contracts";

export function usePlacePhotos(placeIds: string[]) {
  const key = useMemo(
    () =>
      [...new Set(placeIds.filter(isVenuePlaceId))]
        .sort()
        .join(","),
    [placeIds],
  );
  const cacheRef = useRef<Record<string, PlacePhoto>>({});
  const [photos, setPhotos] = useState<Record<string, PlacePhoto>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    for (const id of Object.keys(cacheRef.current)) {
      if (!ids.includes(id)) delete cacheRef.current[id];
    }
    const missing = ids.filter((id) => !cacheRef.current[id]);
    setPhotos({ ...cacheRef.current });
    if (!missing.length) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void api<PlacePhotosResponse>(`/api/places/photos?ids=${encodeURIComponent(missing.join(","))}`)
      .then((result) => {
        if (!active) return;
        for (const photo of result.photos) cacheRef.current[photo.placeId] = photo;
        for (const id of Object.keys(cacheRef.current)) {
          if (!ids.includes(id)) delete cacheRef.current[id];
        }
        setPhotos({ ...cacheRef.current });
      })
      .catch(() => {
        if (!active) return;
        for (const id of missing) {
          cacheRef.current[id] = {
            placeId: id,
            state: "failed",
            kind: "VENUE",
            source: "places",
            imageUrl: null,
            googleMapsUri: null,
            authorAttributions: [],
          };
        }
        setPhotos({ ...cacheRef.current });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]);

  return { photos, loading };
}
