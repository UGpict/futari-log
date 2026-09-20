"use client";

import { useId, type ButtonHTMLAttributes } from "react";
import { Plus } from "lucide-react";
import styles from "./date-create-button.module.css";

export function DateCreateButton({ className, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "type">) {
  const circleId = `create-date-${useId().replaceAll(":", "")}`;
  return <button {...props} type="button" className={[styles.button, className].filter(Boolean).join(" ")} aria-label="新しいプランを作る">
    <svg className={styles.text} viewBox="0 0 100 100" aria-hidden="true">
      <defs><path id={circleId} d="M 50,50 m -42,0 a 42,42 0 1,1 84,0 a 42,42 0 1,1 -84,0" /></defs>
      <text><textPath href={`#${circleId}`} startOffset="6%">新しいプランを作る</textPath></text>
    </svg>
    <span className={styles.core}><Plus size={29} aria-hidden="true" /></span>
  </button>;
}
