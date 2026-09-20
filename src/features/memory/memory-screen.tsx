"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/client/api";
import { useMemory } from "@/client/hooks/use-memory";

export function MemoryScreen({ coupleId }: { coupleId: string | null }) {
  const { memories, candidates, msg, setMsg, load } = useMemory(coupleId);
  const [edit, setEdit] = useState<Record<string, string>>({});

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