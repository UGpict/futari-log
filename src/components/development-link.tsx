import Link from "next/link";
import { Wrench } from "lucide-react";
import styles from "./development-link.module.css";

export function DevelopmentLink() {
  if (process.env.NODE_ENV !== "development") return null;
  return <aside className={styles.link} aria-label="開発ツール"><Link className={styles.button} href="/dev/components" aria-label="開発用ページを開く"><Wrench size={20} aria-hidden="true" /><span>DEV</span></Link></aside>;
}
