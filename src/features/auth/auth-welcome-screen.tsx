"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, ButtonLink } from "@/components/button";
import { FutariLogo } from "@/components/futari-logo";
import { ensureAuth } from "@/client/api";
import { rememberAuthEntry } from "@/client/auth-entry";

import styles from "./auth-welcome-screen.module.css";

export function AuthWelcomeScreen() {
  const router = useRouter();

  async function continueAsGuest() {
    rememberAuthEntry("guest");
    try {
      await ensureAuth();
      router.replace("/");
    } catch {
      router.replace("/");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.screen} aria-labelledby="welcome-title">
        <div className={styles.content}>
          <FutariLogo className={styles.logo} />
          <div className={styles.copy}>
            <h1 id="welcome-title">デートプランも、<br />もう悩まない。</h1>
            <p className={styles.description}>
              ふたりの希望を聞いて、<br />ぴったりの一日を提案します。
            </p>
          </div>

          <div className={styles.actions}>
            <Button fullWidth type="button" onClick={() => void continueAsGuest()}>ゲストではじめる</Button>
            <ButtonLink fullWidth variant="secondary" href="/auth/login">ログインする</ButtonLink>
            <p className={styles.signup}>アカウントをお持ちでない方は <Link href="/auth/signup">新規作成</Link></p>
          </div>
        </div>
      </section>
    </main>
  );
}
