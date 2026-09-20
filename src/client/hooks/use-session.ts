"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionSnapshot, StartRunRequest } from "@/contracts";
import { api, ensureAuth, fixturesEnabled } from "../api";

export function useSession(sessionId: string) {
  const [data, setData] = useState<SessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyRef = useRef(`replan:${sessionId}:${crypto.randomUUID()}`);

  const reload = useCallback(async () => {
    if (fixturesEnabled() && sessionId === "fx-loading") return;
    const snap = await api<SessionSnapshot>(`/api/sessions/${sessionId}`);
    setData(snap);
  }, [sessionId]);

  useEffect(() => {
    if (fixturesEnabled() && sessionId === "fx-loading") {
      return;
    }
    const load = () => api<SessionSnapshot>(`/api/sessions/${sessionId}`).then(setData);
    void ensureAuth()
      .then(() => load())
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const t = setInterval(() => void load().catch(() => undefined), 1200);
    return () => clearInterval(t);
  }, [sessionId]);

  async function post(path: string, body: unknown) {
    setError(null);
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    }
  }

  async function startReplan(input: {
    instruction: string;
    targetPlanItemId?: string;
    basePlanVersion: number;
  }) {
    const body: StartRunRequest = {
      kind: "REPLAN",
      instruction: input.instruction,
      basePlanVersion: input.basePlanVersion,
      ...(input.targetPlanItemId ? { targetPlanItemId: input.targetPlanItemId } : {}),
    };
    try {
      await api(`/api/sessions/${sessionId}/runs`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyRef.current },
        body: JSON.stringify(body),
      });
      await reload();
    } finally {
      idempotencyRef.current = `replan:${sessionId}:${crypto.randomUUID()}`;
    }
  }

  return { data, error, setError, reload, post, startReplan };
}
