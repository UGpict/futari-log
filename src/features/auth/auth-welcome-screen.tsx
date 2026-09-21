"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, ButtonLink } from "@/components/button";
import { ensureAuth } from "@/client/api";
import { rememberAuthEntry } from "@/client/auth-entry";

import motion from "./auth-content-motion.module.css";
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
    <section aria-labelledby="welcome-title">
          <div className={`${styles.copy} ${motion.intro}`}>
            <h1 id="welcome-title">次のデート、もう悩まない</h1>
            <p className={styles.description}>
              ふたりの希望を聞いて、<br />ぴったりの一日を提案します。
            </p>
          </div>

          <div className={`${styles.actions} ${motion.controls}`}>
            <Button fullWidth type="button" onClick={() => void continueAsGuest()}>ゲストではじめる</Button>
            <ButtonLink fullWidth variant="secondary" href="/auth/login">ログインする</ButtonLink>
            <p className={styles.signup}>アカウントをお持ちでない方は <Link href="/auth/signup">新規作成</Link></p>
          </div>
    </section>
  );
}
