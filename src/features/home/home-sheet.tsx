"use client";

import { useId, useState, type ReactNode } from "react";
import { IconButton } from "@/components/button";
import { ModalSurface } from "@/components/modal-surface";
import { X } from "lucide-react";
import styles from "./home.module.css";

export function HomeSheet({ title, onClose, children, fixedHeight = false, confirmClose = false }: {
  title: string; onClose: () => void; children: ReactNode; fixedHeight?: boolean; confirmClose?: boolean;
}) {
  const titleId = useId();
  const confirmTitleId = useId();
  const confirmDescriptionId = useId();
  const [confirmingClose, setConfirmingClose] = useState(false);
  const requestClose = () => {
    if (confirmClose) setConfirmingClose(true);
    else onClose();
  };

  return (
    <ModalSurface className={`${styles.sheet} ${fixedHeight ? styles.fixedSheet : ""}`} contentClassName={styles.sheetInner}
      labelledBy={titleId} onClose={requestClose}>
      <div className={styles.sheetHandle} aria-hidden="true" />
      <header className={styles.sheetHeader}>
        <h2 id={titleId}>{title}</h2>
        <IconButton type="button" label="閉じる" onClick={requestClose}><X size={21} /></IconButton>
      </header>
      {children}
      {confirmingClose && <ModalSurface centered alert className={styles.closeConfirm}
        labelledBy={confirmTitleId} describedBy={confirmDescriptionId} onClose={() => setConfirmingClose(false)}>
        <h3 id={confirmTitleId}>プラン作成をやめますか？</h3>
        <p id={confirmDescriptionId}>ここまで入力した内容は消えてしまいます。</p>
        <div className={styles.closeConfirmActions}>
          <button type="button" onClick={() => setConfirmingClose(false)} autoFocus>入力を続ける</button>
          <button type="button" onClick={onClose}>内容を破棄して閉じる</button>
        </div>
      </ModalSurface>}
    </ModalSurface>
  );
}
