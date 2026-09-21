"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { HomeLogo } from "@/components/home-logo";
import { ModalSurface } from "@/components/modal-surface";
import styles from "./plan-page.module.css";

export function PlanPageHeader() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <header className={styles.header}>
        <HomeLogo className={styles.logo} onClick={() => setConfirming(true)} />
      </header>
      {confirming && <ModalSurface centered alert className={styles.closeConfirm}
        labelledBy={titleId} describedBy={descriptionId} onClose={() => setConfirming(false)}>
        <h2 id={titleId}>プラン作成をやめますか？</h2>
        <p id={descriptionId}>ここまで入力した内容は消えてしまいます。</p>
        <div className={styles.closeConfirmActions}>
          <button type="button" onClick={() => setConfirming(false)} autoFocus>入力を続ける</button>
          <button type="button" onClick={() => router.push("/")}>内容を破棄してホームへ</button>
        </div>
      </ModalSurface>}
    </>
  );
}
