"use client";

import { useEffect, useEffectEvent } from "react";
import { Check } from "lucide-react";
import styles from "./toast.module.css";

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => dismiss(), 2000);
    return () => window.clearTimeout(timer);
  }, [message]);
  return <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
    {message && <div key={message} className={styles.toast}><Check size={18} aria-hidden="true" /><span>{message}</span></div>}
  </div>;
}
