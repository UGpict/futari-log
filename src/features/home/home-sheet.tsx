"use client";

import { IconButton } from "@/components/button";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import styles from "./home.module.css";

export function HomeSheet({ title, onClose, children, fixedHeight = false }: {
  title: string; onClose: () => void; children: ReactNode; fixedHeight?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog ref={ref} className={`${styles.sheet} ${fixedHeight ? styles.fixedSheet : ""}`} aria-labelledby={titleId}
      onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.sheetInner}>
        <div className={styles.sheetHandle} aria-hidden="true" />
        <header className={styles.sheetHeader}>
          <h2 id={titleId}>{title}</h2>
          <IconButton type="button"  label="閉じる" onClick={onClose}><X size={21} /></IconButton>
        </header>
        {children}
      </div>
    </dialog>
  );
}
