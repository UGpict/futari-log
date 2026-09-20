"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, ensureAuth } from "@/lib/client";

type Mem = {
  id: string;
  content: string;
  active: boolean;
  strength: string;
  sourceType: string;
  evidenceQuote: string;
  confirmation: string;
  version: number;
};
type Cand = { id: string; content: string; evidenceQuote: string };

function MemoryInner() {
  const search = useSearchParams();
  const coupleId = search.get("couple");
  const [memories, setMemories] = useState<Mem[]>([]);
  const [candidates, setCandidates] = useState<Cand[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    if (!coupleId) return;
    const data = await api<{ memories: Mem[]; candidates: Cand[] }>(
      `/api/couples/${coupleId}/memory`,
    );
    setMemories(data.memories);
    setCandidates(data.candidates);
  }

  useEffect(() => {
    if (!coupleId) return;
    void ensureAuth().then(async () => {
      const data = await api<{ memories: Mem[]; candidates: Cand[] }>(
        `/api/couples/${coupleId}/memory`,
      );
      setMemories(data.memories);
      setCandidates(data.candidates);
    });
  }, [coupleId]);

  if (!coupleId) return <main className="p-8">couple が指定されていません</main>;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-rose">
        ← ホーム
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">記憶</h1>
      <p className="text-sm text-ink-soft">
        確認回答は承認ではありません。保存する具体文への明示承認で初めて記憶になります。visibility=PRIVATE。
      </p>
      {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
      <section className="mt-6 space-y-4">
        {memories.map((m) => (
          <article key={m.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="text-xs text-ink-soft">
              {m.active ? "有効" : "無効"} / {m.strength} / {m.sourceType} / {m.confirmation} / v{m.version}
            </div>
            <p className="mt-1">{m.content}</p>
            <p className="mt-1 text-sm text-ink-soft">根拠: {m.evidenceQuote}</p>
            <textarea
              className="mt-3 w-full rounded-xl border border-line bg-paper p-2 text-sm"
              value={edit[m.id] ?? m.content}
              onChange={(e) => setEdit({ ...edit, [m.id]: e.target.value })}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="rounded-full border border-line px-3 py-1 text-sm"
                onClick={async () => {
                  await api(`/api/memory/${m.id}/revisions`, {
                    method: "POST",
                    body: JSON.stringify({ content: edit[m.id] ?? m.content }),
                  });
                  setMsg("編集は再承認待ちです");
                  await load();
                }}
              >
                編集して再承認
              </button>
              <button
                className="rounded-full border border-line px-3 py-1 text-sm"
                onClick={async () => {
                  await api(`/api/memory/${m.id}/deactivate`, { method: "POST", body: "{}" });
                  await load();
                }}
              >
                無効化
              </button>
            </div>
          </article>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="font-medium">未承認の候補</h2>
        {candidates.map((c) => (
          <p key={c.id} className="mt-2 rounded-xl bg-paper-deep p-3 text-sm">
            {c.content}
            <span className="block text-ink-soft">根拠: {c.evidenceQuote}</span>
          </p>
        ))}
      </section>
    </main>
  );
}

export default function MemoryPage() {
  return (
    <Suspense fallback={<main className="p-8">読み込み中…</main>}>
      <MemoryInner />
    </Suspense>
  );
}
