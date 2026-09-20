"use client";

import { useCallback, useEffect, useState } from "react";
import type { MemoryCandidateDto, MemoryDto } from "@/contracts";
import { api, ensureAuth } from "../api";

export function useMemory(coupleId: string | null) {
  const [memories, setMemories] = useState<MemoryDto[]>([]);
  const [candidates, setCandidates] = useState<MemoryCandidateDto[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!coupleId) return;
    const data = await api<{ memories: MemoryDto[]; candidates: MemoryCandidateDto[] }>(
      `/api/couples/${coupleId}/memory`,
    );
    setMemories(data.memories);
    setCandidates(data.candidates);
  }, [coupleId]);

  useEffect(() => {
    if (!coupleId) return;
    void ensureAuth().then(() => load());
  }, [coupleId, load]);

  return { memories, candidates, msg, setMsg, load };
}