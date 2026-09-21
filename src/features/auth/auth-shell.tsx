import type { ReactNode } from "react";
import { AuthBrand } from "./auth-brand";
import styles from "./auth-layout.module.css";

export function AuthShell({ children }: { children: ReactNode }) {
  return <main className={styles.page}><div className={styles.screen}>
    <div className={styles.content}>
      <AuthBrand />
      <div className={styles.body}>{children}</div>
    </div>
  </div></main>;
}
