import Link from "next/link";
import { FutariLogo } from "./futari-logo";
import styles from "./home-logo.module.css";

export function HomeLogo({ className }: { className?: string }) {
  return (
    <Link href="/" className={[styles.link, className].filter(Boolean).join(" ")} aria-label="ホームへ戻る">
      <FutariLogo className={styles.logo} />
    </Link>
  );
}
