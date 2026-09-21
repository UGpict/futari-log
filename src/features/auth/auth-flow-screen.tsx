"use client";

import { ChevronLeft, Check, Eye, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";

import { Button, ButtonLink, IconButton } from "@/components/button";
import { TextInput } from "@/components/text-input";

import motion from "./auth-content-motion.module.css";
import styles from "./auth-flow-screen.module.css";

type AuthView = "login" | "signup" | "verify" | "forgot-password";

const viewCopy: Record<AuthView, { eyebrow: string; title: string; description: string }> = {
  login: {
    eyebrow: "おかえりなさい",
    title: "おかえりなさい",
    description: "",
  },
  signup: {
    eyebrow: "",
    title: "アカウントを作る",
    description: "",
  },
  verify: {
    eyebrow: "あと少しです",
    title: "メールを確認してください",
    description: "確認メールを sample@example.com に送りました。メール内のリンクを開いてください。",
  },
  "forgot-password": {
    eyebrow: "パスワードをお忘れですか？",
    title: "再設定メールを送る",
    description: "",
  },
};

function EmailField() {
  return <label className={styles.field}><span>メールアドレス</span><span className={styles.inputWrap}><Mail aria-hidden="true" /><TextInput type="email" inputMode="email" autoComplete="email" placeholder="mail@example.com" /></span></label>;
}

function PasswordField({ label = "パスワード", autoComplete = "current-password" }: { label?: string; autoComplete?: string }) {
  return <label className={styles.field}><span>{label}</span><span className={styles.inputWrap}><LockKeyhole aria-hidden="true" /><TextInput type="password" autoComplete={autoComplete} placeholder="8文字以上" /><IconButton className={styles.eyeButton} type="button" label={`${label}を表示`}><Eye /></IconButton></span></label>;
}

export function AuthFlowScreen({ view }: { view: AuthView }) {
  const copy = viewCopy[view];
  const backHref = view === "login" ? "/auth" : "/auth/login";

  return <section key={view} aria-labelledby="auth-title">
      <header className={styles.header}>
        <Link href={backHref} className={styles.backLink}><ChevronLeft size={18} aria-hidden="true" />戻る</Link>
      </header>

      <div className={`${styles.intro} ${motion.intro}`}>
        {view !== "login" && copy.eyebrow && <p>{copy.eyebrow}</p>}
        <h1 id="auth-title">{copy.title}</h1>
        {copy.description && <span>{copy.description}</span>}
      </div>

      <form className={`${styles.form} ${motion.controls}`} onSubmit={(event) => event.preventDefault()}>
        {view === "login" && <><EmailField /><PasswordField /><Link className={styles.textLink} href="/auth/forgot-password">パスワードを忘れた方</Link><Button fullWidth type="submit">ログイン</Button><p className={styles.switch}>はじめての方は <Link href="/auth/signup">アカウントを作る</Link></p></>}
        {view === "signup" && <><EmailField /><PasswordField autoComplete="new-password" /><PasswordField label="パスワード（確認）" autoComplete="new-password" /><p className={styles.note}>8文字以上で入力してください</p><Button fullWidth type="submit">アカウントを作る</Button><p className={styles.switch}>すでにアカウントをお持ちですか？ <Link href="/auth/login">ログイン</Link></p></>}
        {view === "forgot-password" && <><EmailField /><Button fullWidth type="submit">再設定メールを送る</Button><ButtonLink fullWidth variant="secondary" href="/auth/login">ログインへ戻る</ButtonLink></>}
        {view === "verify" && <div className={styles.simpleActions}><div className={styles.status}><Check aria-hidden="true" /><span>確認メールを送信しました</span></div><Button fullWidth type="button">確認が完了したかチェック</Button><Button fullWidth variant="secondary" type="button">確認メールを再送</Button><ButtonLink fullWidth variant="ghost" href="/auth/login">別のアカウントを使う</ButtonLink></div>}
      </form>

    </section>;
}
