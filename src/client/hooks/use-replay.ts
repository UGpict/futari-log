"use client";

import { useEffect, useState } from "react";
import type { ReplayDto } from "@/contracts";
import { api, ensureAuth } from "../api";

export function useReplay(id: string) {
  const [data, setData] = useState<ReplayDto | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    void ensureAuth()
      .then(() => api<{ replay: ReplayDto }>(`/api/replays/${id}`))
      .then((r) => setData(r.replay));
  }, [id]);

  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => {
      setIndex((i) => Math.min(i + 1, data.events.length - 1));
    }, 700);
    return () => clearInterval(t);
  }, [playing, data]);

  return { data, index, setIndex, playing, setPlaying };
}