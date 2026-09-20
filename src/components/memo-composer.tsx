"use client";

import { useId, useRef, useState } from "react";
import { Button } from "./button";
import styles from "./memo-composer.module.css";

export function MemoComposer({ onAdd }: { onAdd: (content: string) => void }) {
  const [value, setValue] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  return <section className={styles.composer} aria-label="メモを追加">
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (!value.trim()) return;
      onAdd(value.trim()); setValue(""); input.current?.focus({ preventScroll: true });
    }}>
      <label htmlFor={`${id}-content`}>メモを書く</label>
      <textarea ref={input} id={`${id}-content`} value={value} onChange={event => setValue(event.target.value)} maxLength={300} rows={2} placeholder="長時間歩くのが大変そうだった" />
      <Button type="submit" size="compact" fullWidth disabled={!value.trim()}>メモを追加</Button>
    </form>
  </section>;
}
