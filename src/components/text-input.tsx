import type { ComponentProps } from "react";
import styles from "./text-input.module.css";

// Native controls preserve IME, selection, autofill, and platform keyboard behavior.
// React 19 passes ref through props, including refs used by existing forms.
export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={[styles.control, className].filter(Boolean).join(" ")} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={[styles.control, className].filter(Boolean).join(" ")} />;
}

export function SelectInput({ className, ...props }: ComponentProps<"select">) {
  return <select {...props} className={[styles.control, className].filter(Boolean).join(" ")} />;
}
