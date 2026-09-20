"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ensureAuth } from "@/lib/client";
import { CostBadge } from "@/components/cost-badge";
import { ModeBanner } from "@/components/mode-banner";

type Replay = {
  replay: {
    id: string;
    events: { eventId: string; seq: number; type: string; summary: string }[];
    plan: {
      items: { id: string; spotId: string; startAt: string; endAt: string; reason: string }[];
    } | null;
    spots: { id: string; name: string }[];
    costSnapshot: {
      llmJpy: number | null;
      apiJpy: number | null;
      mundaneCalls: number;
      hardCalls: number;
      unaccountedCalls: number;
    };
    notes: string;
  };
};

export default function ReplayPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Replay["replay"] | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    void ensureAuth()
      .then(() => api<Replay>(`/api/replays/${params.id}`))
      .then((r) => setData(r.replay));
  }, [params.id]);

  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => {
      setIndex((i) => Math.min(i + 1, data.events.length - 1));
    }, 700);
    return () => clearInterval(t);
  }, [playing, data]);

  if (!data) return <main className="p-8">読み込み中…</main>;
  const visible = data.events.slice(0, index + 1);
  const spots = Object.fromEntries(data.spots.map((s) => [s.id, s.name]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 pb-28">
      <ModeBanner runtime="REPLAY" replay />
      <h1 className="mt-4 text-2xl font-semibold">REPLAY</h1>
      <p className="text-sm text-ink-soft">{data.notes}</p>
      <div className="mt-4 flex gap-2">
        <button className="rounded-full bg-ink px-4 py-2 text-sm text-white" onClick={() => setPlaying((p) => !p)}>
          {playing ? "停止" : "再生"}
        </button>
        <button className="rounded-full border border-line px-4 py-2 text-sm" onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          戻る
        </button>
        <button
          className="rounded-full border border-line px-4 py-2 text-sm"
          onClick={() => setIndex((i) => Math.min(data.events.length - 1, i + 1))}
        >
          進む
        </button>
      </div>
      <ol className="mt-6 space-y-2 text-sm">
        {visible.map((e) => (
          <li key={e.eventId} className="rounded-xl bg-card p-3">
            <span className="text-ink-soft">{e.type}</span> {e.summary}
          </li>
        ))}
      </ol>
      {data.plan ? (
        <section className="mt-6 rounded-2xl border border-line bg-card p-4">
          <h2 className="font-medium">収録時の行程</h2>
          <ul className="mt-2 text-sm">
            {data.plan.items.map((it) => (
              <li key={it.id}>
                {spots[it.spotId] ?? it.spotId} — {it.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <CostBadge
        replay
        llmJpy={data.costSnapshot.llmJpy}
        apiJpy={data.costSnapshot.apiJpy}
        hard={data.costSnapshot.hardCalls}
        mundane={data.costSnapshot.mundaneCalls}
        unaccounted={data.costSnapshot.unaccountedCalls}
      />
    </main>
  );
}
