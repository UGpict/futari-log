"use client";

import { ArrowLeft, Check, Eye, LockKeyhole, LogOut, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, ButtonLink, IconButton } from "@/components/button";
import { FutariLogo } from "@/components/futari-logo";
import { TextInput } from "@/components/text-input";
import { forgetAuthEntry } from "@/client/auth-entry";

import styles from "./auth-flow-screen.module.css";

type AuthView = "login" | "signup" | "verify" | "forgot-password" | "logout";

const viewCopy: Record<AuthView, { eyebrow: string; title: string; description: string }> = {
  login: {
    eyebrow: "おかえりなさい",
    title: "ふたりのページへ",
    description: "登録したメールアドレスとパスワードでログインします。",
  },
  signup: {
    eyebrow: "はじめまして",
    title: "アカウントを作る",
    description: "大切な予定と記憶を、安心して残せる場所を作りましょう。",
  },
  verify: {
    eyebrow: "あと少しです",
    title: "メールを確認してください",
    description: "確認メールを sample@example.com に送りました。メール内のリンクを開いてください。",
  },
  "forgot-password": {
    eyebrow: "パスワードをお忘れですか？",
    title: "再設定メールを送る",
    description: "登録したメールアドレスへ、パスワード再設定用のリンクを送ります。",
  },
  logout: {
    eyebrow: "アカウント",
    title: "ログアウトしますか？",
    description: "この端末で、ふたりログからログアウトします。保存済みの記録は消えません。",
  },
};

function EmailField() {
  return <label className={styles.field}><span>メールアドレス</span><span className={styles.inputWrap}><Mail aria-hidden="true" /><TextInput type="email" inputMode="email" autoComplete="email" placeholder="mail@example.com" /></span></label>;
}

function PasswordField({ label = "パスワード", autoComplete = "current-password" }: { label?: string; autoComplete?: string }) {
  return <label className={styles.field}><span>{label}</span><span className={styles.inputWrap}><LockKeyhole aria-hidden="true" /><TextInput type="password" autoComplete={autoComplete} placeholder="8文字以上" /><IconButton className={styles.eyeButton} type="button" label={`${label}を表示`}><Eye /></IconButton></span></label>;
}

export function AuthFlowScreen({ view }: { view: AuthView }) {
  const router = useRouter();
  const copy = viewCopy[view];
  const backHref = view === "login" ? "/auth" : view === "logout" ? "/" : "/auth/login";

  function logout() {
    forgetAuthEntry();
    router.replace("/auth");
  }

  return <main className={styles.page}>
    <section className={styles.screen} aria-labelledby="auth-title">
      <header className={styles.header}>
        <ButtonLink href={backHref} variant="ghost" size="compact"><ArrowLeft />戻る</ButtonLink>
        <FutariLogo className={styles.logo} />
        <span className={styles.headerSpacer} />
      </header>

      <div className={styles.intro}>
        <span className={styles.icon} aria-hidden="true">{view === "verify" ? <Mail /> : view === "logout" ? <LogOut /> : <LockKeyhole />}</span>
        <p>{copy.eyebrow}</p>
        <h1 id="auth-title">{copy.title}</h1>
        <span>{copy.description}</span>
      </div>

      <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
        {view === "login" && <><EmailField /><PasswordField /><Link className={styles.textLink} href="/auth/forgot-password">パスワードを忘れた方</Link><Button fullWidth type="submit">ログイン</Button><p className={styles.switch}>はじめての方は <Link href="/auth/signup">アカウントを作る</Link></p></>}
        {view === "signup" && <><EmailField /><PasswordField autoComplete="new-password" /><PasswordField label="パスワード（確認）" autoComplete="new-password" /><p className={styles.note}>8文字以上で入力してください</p><Button fullWidth type="submit">アカウントを作る</Button><p className={styles.switch}>すでにアカウントをお持ちですか？ <Link href="/auth/login">ログイン</Link></p></>}
        {view === "forgot-password" && <><EmailField /><Button fullWidth type="submit">再設定メールを送る</Button><ButtonLink fullWidth variant="secondary" href="/auth/login">ログインへ戻る</ButtonLink></>}
        {view === "verify" && <div className={styles.simpleActions}><div className={styles.status}><Check aria-hidden="true" /><span>確認メールを送信しました</span></div><Button fullWidth type="button">確認が完了したかチェック</Button><Button fullWidth variant="secondary" type="button">確認メールを再送</Button><ButtonLink fullWidth variant="ghost" href="/auth/login">別のアカウントを使う</ButtonLink></div>}
        {view === "logout" && <div className={styles.simpleActions}><Button fullWidth variant="danger" type="button" onClick={logout}><LogOut />ログアウト</Button><ButtonLink fullWidth variant="secondary" href="/">キャンセル</ButtonLink></div>}
      </form>

    </section>
  </main>;
}
