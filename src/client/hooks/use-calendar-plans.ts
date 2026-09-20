"use client";

import { useEffect, useState } from "react";
import { api, fixturesEnabled } from "@/client/api";
// UI-only projection for the calendar mock. A shared API contract will be
// provided by the backend owner when calendar integration is ready.
type CalendarPlan = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  title: string;
};

export function useCalendarPlans(coupleId?: string | null) {
  const [state, setState] = useState<{ coupleId: string; plans: CalendarPlan[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!coupleId || !fixturesEnabled()) return;
    let active = true;
    const load = async () => {
      try {
        const result = await api<{ plans: CalendarPlan[] }>(`/api/couples/${coupleId}/sessions`);
        if (active) { setState({ coupleId, plans: result.plans }); setError(""); }
      } catch { if (active) setError("予定を読み込めませんでした。少し待ってから開き直してください。"); }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [coupleId]);
  return { plans: state && state.coupleId === coupleId ? state.plans : [], error };
}
