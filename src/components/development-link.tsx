"use client";

import Link from "next/link";
import { Blocks, KeyRound, LogOut, Trash2, Wrench, X } from "lucide-react";
import { useState } from "react";
import styles from "./development-link.module.css";

export function DevelopmentLink({ onResetToday }: { onResetToday?: () => void }) {
  const [open, setOpen] = useState(false);
  if (process.env.NODE_ENV !== "development") return null;
  return <aside className={styles.link} aria-label="開発ツール">
    <button className={styles.button} type="button" aria-label="開発ツールを開く" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? <X aria-hidden="true" /> : <Wrench aria-hidden="true" />}<span>DEV</span>
    </button>
    {open && <div className={styles.menu}>
      <strong>開発ツール</strong>
      {onResetToday && <button type="button" className={styles.resetButton} onClick={() => { onResetToday(); setOpen(false); }}><Trash2 aria-hidden="true" /><span>今日の記録を削除<small>入力フローをもう一度試す</small></span></button>}
      <Link className={styles.menuLink} href="/dev/components"><Blocks aria-hidden="true" /><span>部品一覧を開く</span></Link>
      <Link className={styles.menuLink} href="/dev/auth"><KeyRound aria-hidden="true" /><span>認証画面一覧</span></Link>
      <Link className={styles.logoutLink} href="/auth/logout"><LogOut aria-hidden="true" /><span>ログアウト</span></Link>
    </div>}
  </aside>;
}
