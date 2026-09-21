"use client";

import { TextArea } from "@/components/text-input";

import { useState } from "react";
import { api } from "@/client/api";
import { createClientId } from "@/client/id";
import { useMemory } from "@/client/hooks/use-memory";
import { Button } from "@/components/button";
import { Toast } from "@/components/toast";
import { MemoComposer } from "@/components/memo-composer";
import { HomeLogo } from "@/components/home-logo";
import styles from "./memory-screen.module.css";

type Draft = { id: string; content: string };

export function MemoryScreen({ coupleId, embedded = false }: { coupleId: string | null; embedded?: boolean }) {
  const Container = embedded ? "div" : "main";
  const containerClass = embedded ? styles.embedded : styles.page;
  const { memories, msg, setMsg, load } = useMemory(coupleId);
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    try { return JSON.parse(localStorage.getItem(`futari-memory-notes:${coupleId ?? "guest"}`) ?? "[]"); } catch { return []; }
  });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const storageKey = `futari-memory-notes:${coupleId ?? "guest"}`;

  function saveDrafts(next: Draft[]) { localStorage.setItem(storageKey, JSON.stringify(next)); setDrafts(next); }
  if (!coupleId) return <Container className={containerClass}>{!embedded && <HomeLogo className={styles.homeLogo} />}<p>最初のデートプランを作ると、ここにふたりのメモを残せます。</p></Container>;

  const activeMemories = memories.filter((memory) => memory.active);
  const notes = [...drafts.map((draft) => ({ ...draft, local: true })), ...activeMemories.map((memory) => ({ id: memory.id, content: memory.content, local: false }))];
  function addMemo(content: string) {
    saveDrafts([{ id: createClientId(), content }, ...drafts]); setMsg("メモを追加しました");
  }
  async function revise(id: string, content: string) {
    await api(`/api/memory/${id}/revisions`, { method: "POST", body: JSON.stringify({ content }) });
    setEditingId(null); setMsg("変更内容を確認待ちにしました"); await load();
  }

  async function removeMemo(id: string, local: boolean) {
    if (removingId) return;
    setRemovingId(id); setRemoveError(null);
    try {
      if (local) saveDrafts(drafts.filter((draft) => draft.id !== id));
      else { await api(`/api/memory/${id}/deactivate`, { method: "POST", body: "{}" }); await load(); }
      setMsg("メモを削除しました");
    } catch {
      setRemoveError("メモを削除できませんでした。もう一度お試しください。");
    } finally { setRemovingId(null); }
  }

  return <Container className={containerClass}>
    {!embedded && <HomeLogo className={styles.homeLogo} />}
    {!embedded && <header className={styles.hero}><h1>次のデートに活かすこと</h1></header>}
    <MemoComposer onAdd={addMemo} />
    <Toast message={msg ?? ""} onDismiss={() => setMsg(null)} />
    {removeError && <p role="alert" className={styles.error}>{removeError}</p>}
    <section className={styles.section} aria-labelledby="all-memories">
      <h2 id="all-memories" className={styles.sectionHeading}>保存したメモ</h2>
      <div className={styles.listScroll}>
        {notes.length ? <div className={styles.memoryList}>{notes.map((memory) => {
          const isEditing = editingId === memory.id;
          const value = edit[memory.id] ?? memory.content;
          return <article key={memory.id} className={styles.memoryCard}>
            {isEditing ? <>
              <TextArea aria-label="メモの内容" value={value} maxLength={300} onChange={(event) => setEdit({ ...edit, [memory.id]: event.target.value })} />
              <div className={styles.actions}>
                <Button variant="secondary" size="compact" onClick={() => setEditingId(null)}>キャンセル</Button>
                <Button size="compact" disabled={!value.trim() || value.trim() === memory.content} onClick={() => {
                  if (memory.local) {
                    saveDrafts(drafts.map((draft) => draft.id === memory.id ? { ...draft, content: value.trim() } : draft));
                    setEditingId(null); setMsg("メモを更新しました");
                  } else void revise(memory.id, value.trim());
                }}>{memory.local ? "保存" : "変更を確認に送る"}</Button>
              </div>
            </> : <>
              <p className={styles.content}>{memory.content}</p>
              <footer className={styles.noteFooter}>
                <div className={styles.actions}>
                  <Button variant="ghost" size="compact" onClick={() => { setEdit({ ...edit, [memory.id]: memory.content }); setEditingId(memory.id); }}>編集</Button>
                  <Button variant="ghost" size="compact" disabled={removingId !== null} onClick={() => void removeMemo(memory.id, memory.local)}>{removingId === memory.id ? "削除中…" : "削除"}</Button>
                </div>
              </footer>
            </>}
          </article>;
        })}</div> : <p className={styles.empty}>まだメモはありません。</p>}
      </div>
    </section>
  </Container>;
}
