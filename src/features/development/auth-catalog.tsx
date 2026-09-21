import { ArrowLeft, KeyRound, LogIn, LogOut, MailCheck, UserPlus } from "lucide-react";

import { ButtonLink } from "@/components/button";

import styles from "./auth-catalog.module.css";

const views = [
  { href: "/auth", icon: KeyRound, title: "認証入口", note: "イラストとアカウント作成・ログインの入口" },
  { href: "/auth/login", icon: LogIn, title: "ログイン", note: "メールアドレスとパスワード" },
  { href: "/auth/signup", icon: UserPlus, title: "アカウント作成", note: "確認入力を含む新規登録フォーム" },
  { href: "/auth/verify", icon: MailCheck, title: "メール確認", note: "送信完了・確認・再送の状態" },
  { href: "/auth/forgot-password", icon: KeyRound, title: "パスワード再設定", note: "再設定メールの送信フォーム" },
  { href: "/auth/logout", icon: LogOut, title: "ログアウト", note: "ログアウト前の確認画面" },
];

export function AuthCatalog() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <ButtonLink href="/dev/components" variant="secondary" size="compact"><ArrowLeft />部品一覧へ</ButtonLink>
      <p>FUTARILOG / DEVELOPMENT ONLY</p>
      <h1>認証画面一覧</h1>
      <span>各画面はUIプレビューです。認証処理やログアウト処理は実行しません。</span>
    </header>
    <section className={styles.grid} aria-label="認証画面">
      {views.map(({ href, icon: Icon, title, note }) => <article key={href}>
        <span className={styles.icon}><Icon aria-hidden="true" /></span>
        <div><h2>{title}</h2><p>{note}</p><code>{href}</code></div>
        <ButtonLink href={href} variant="secondary">画面を開く</ButtonLink>
      </article>)}
    </section>
  </main>;
}
