import Link from "next/link";
import type { MouseEventHandler } from "react";
import { FutariLogo } from "./futari-logo";
import styles from "./home-logo.module.css";

export function HomeLogo({ className, onClick }: { className?: string; onClick?: MouseEventHandler<HTMLButtonElement> }) {
  const content = <FutariLogo className={styles.logo} />;
  if (onClick) {
    return <button type="button" className={[styles.link, className].filter(Boolean).join(" ")} aria-label="ホームへ戻る" onClick={onClick}>{content}</button>;
  }
  return (
    <Link href="/" className={[styles.link, className].filter(Boolean).join(" ")} aria-label="ホームへ戻る">
      {content}
    </Link>
  );
}
