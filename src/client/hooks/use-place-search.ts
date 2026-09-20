"use client";

import { useEffect, useState } from "react";
import { api } from "@/client/api";
import type { PlaceCandidate, PlaceSearchState } from "@/contracts";

export function usePlaceSearch(query: string, bias?: { lat: number; lng: number } | null) {
  const [places, setPlaces] = useState<PlaceCandidate[]>([]);
  const [state, setState] = useState<PlaceSearchState>("empty");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setPlaces([]);
      setState("empty");
      setError("");
      setPending(false);
      return;
    }
    let active = true;
    setPending(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (bias) {
        params.set("lat", String(bias.lat));
        params.set("lng", String(bias.lng));
      }
      void api<{ places: PlaceCandidate[]; state: PlaceSearchState; error: string | null }>(
        `/api/places/search?${params}`,
      )
        .then((result) => {
          if (!active) return;
          setPlaces(result.places);
          setState(result.state);
          setError(result.error ?? "");
        })
        .catch(() => {
          if (!active) return;
          setPlaces([]);
          setState("failed");
          setError("場所を検索できませんでした。");
        })
        .finally(() => {
          if (active) setPending(false);
        });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, bias?.lat, bias?.lng]);

  return { places, state, error, pending };
}
