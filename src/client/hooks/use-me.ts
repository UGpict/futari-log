"use client";

import { useEffect, useState } from "react";
import type { MeResponse } from "@/contracts";
import { ensureAuth } from "../api";

export function useMe() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void ensureAuth()
      .then(setMe)
      .catch((e) => setError(e instanceof Error ? e.message : "failed"));
  }, []);

  return { me, error, setMe };
}