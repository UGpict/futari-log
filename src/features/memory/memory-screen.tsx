"use client";

import Link from "next/link";
import { ArrowLeft, Check, HeartHandshake, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/client/api";
import { useMemory } from "@/client/hooks/use-memory";
import styles from "./memory-screen.module.css";

type Draft = { id: string; content: string };

export function MemoryScreen({ coupleId, embedded = false }: { coupleId: string | null; embedded?: boolean }) {
  const Container = embedded ? "div" : "main";
  const containerClass = embedded ? styles.embedded : styles.page;
  const { memories, msg, setMsg, load } = useMemory(coupleId);
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    try { return JSON.parse(localStorage.getItem(`futari-memory-notes:${coupleId ?? "guest"}`) ?? "[]"); } catch { return []; }
  });
  const [newMemo, setNewMemo] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const storageKey = `futari-memory-notes:${coupleId ?? "guest"}`;

  function saveDrafts(next: Draft[]) { setDrafts(next); localStorage.setItem(storageKey, JSON.stringify(next)); }
  if (!coupleId) return <Container className={containerClass}><p>最初のデートプランを作ると、ここにふたりのメモを残せます。</p></Container>;

  const activeMemories = memories.filter((memory) => memory.active);
  const notes = [...drafts.map((draft) => ({ ...draft, local: true })), ...activeMemories.map((memory) => ({ id: memory.id, content: memory.content, local: false }))];
  const visibleNotes = showAll ? notes : notes.slice(0, 3);
  function addMemo() {
    const content = newMemo.trim(); if (!content) return;
    saveDrafts([{ id: crypto.randomUUID(), content }, ...drafts]); setNewMemo(""); setMsg("メモを追加しました");
  }
  async function revise(id: string, content: string) {
    await api(`/api/memory/${id}/revisions`, { method: "POST", body: JSON.stringify({ content }) });
    setEditingId(null); setMsg("変更内容を確認待ちにしました"); await load();
  }

  return <Container className={containerClass}>
    {!embedded && <Link href="/" className={styles.back} aria-label="ホームへ戻る"><ArrowLeft size={18} /></Link>}
    <header className={styles.hero}>{!embedded && <h1>次のデートに活かすこと</h1>}<p>気になったことや、ふたりで大切にしたいことをメモしておこう。</p></header>
    <section className={styles.addCard} aria-labelledby="add-memo"><div className={styles.addHeading}><span><Plus size={15} /></span><h2 id="add-memo">メモを追加</h2></div><textarea value={newMemo} onChange={(event) => setNewMemo(event.target.value)} rows={3} maxLength={300} placeholder="たとえば、歩く距離は少なめがいい。落ち着いたカフェが好き。" /><button type="button" onClick={addMemo} disabled={!newMemo.trim()}>この内容を追加 <Plus size={15} /></button></section>
    {msg && <p className={styles.toast} role="status"><span><Check size={14} /></span>{msg}</p>}
    <section className={styles.section} aria-labelledby="all-memories"><div className={styles.sectionHeading}><div><h2 id="all-memories">追加したメモ</h2><p>ふたりのために残しておいたこと</p></div><span className={styles.count}>{notes.length}</span></div>
      {notes.length ? <div className={styles.memoryList}>{visibleNotes.map((memory) => {
        const isEditing = !memory.local && editingId === memory.id; const value = edit[memory.id] ?? memory.content;
        return <article key={memory.id} className={styles.memoryCard}><HeartHandshake size={20} aria-hidden="true" /><div className={styles.memoryBody}>{isEditing ? <textarea aria-label="メモの内容" value={value} onChange={(event) => setEdit({ ...edit, [memory.id]: event.target.value })} /> : <p>{memory.content}</p>}{memory.local ? <small>この端末に保存</small> : isEditing ? <div className={styles.actions}><button type="button" className={styles.cancel} onClick={() => setEditingId(null)}>キャンセル</button><button type="button" className={styles.save} onClick={() => void revise(memory.id, value)}>変更を保存</button></div> : <button type="button" className={styles.edit} onClick={() => setEditingId(memory.id)}><Pencil size={13} />編集</button>}</div>{memory.local ? <button type="button" className={styles.remove} aria-label="このメモを削除" onClick={() => saveDrafts(drafts.filter((draft) => draft.id !== memory.id))}><X size={16} /></button> : !isEditing && <button type="button" className={styles.remove} aria-label="この記憶を使わない" onClick={async () => { await api(`/api/memory/${memory.id}/deactivate`, { method: "POST", body: "{}" }); await load(); }}><X size={16} /></button>}</article>;
      })}</div> : <div className={styles.empty}><HeartHandshake size={24} /><p>まずは気軽に、ひとつメモを残してみよう。</p></div>}
      {notes.length > 3 && <button type="button" className={styles.more} onClick={() => setShowAll(!showAll)}>{showAll ? "閉じる" : `もっと見る（あと${notes.length - 3}件）`}</button>}
    </section>
  </Container>;
}
