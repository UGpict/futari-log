"use client";

import { Check, ChevronLeft, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api } from "@/client/api";
import { rememberAuthEntry } from "@/client/auth-entry";
import { Button, ButtonLink, IconButton } from "@/components/button";
import { TextInput } from "@/components/text-input";
import type { AuthSessionResponse, AuthVerifyStatus } from "@/contracts";

import motion from "./auth-content-motion.module.css";
import styles from "./auth-flow-screen.module.css";

type AuthView = "login" | "signup" | "verify" | "forgot-password";

const viewCopy: Record<AuthView, { eyebrow: string; title: string; description: string }> = {
  login: { eyebrow: "おかえりなさい", title: "おかえりなさい", description: "" },
  signup: { eyebrow: "", title: "アカウントを作る", description: "" },
  verify: { eyebrow: "あと少しです", title: "メールを確認してください", description: "確認メール内のリンクを開いてください。" },
  "forgot-password": { eyebrow: "パスワードをお忘れですか？", title: "再設定メールを送る", description: "" },
};

export function AuthFlowScreen({ view, initialEmail = "" }: { view: AuthView; initialEmail?: string }) {
  const router = useRouter();
  const copy = viewCopy[view];
  const backHref = view === "login" ? "/auth" : "/auth/login";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setNotice("");
    if (view === "signup" && password !== passwordConfirm) {
      setError("パスワード（確認）が一致しません。");
      return;
    }
    setBusy(true);
    try {
      if (view === "login") {
        await api<AuthSessionResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        rememberAuthEntry("account");
        router.replace("/");
        return;
      }
      if (view === "signup") {
        await api<AuthSessionResponse>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
        rememberAuthEntry("account");
        router.replace(`/auth/verify?email=${encodeURIComponent(email.trim())}`);
        return;
      }
      if (view === "forgot-password") {
        await api("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
        setNotice("再設定用のメールを送りました。届かない場合は迷惑メールフォルダも確認してください。");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "処理に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function checkVerified() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const status = await api<AuthVerifyStatus>("/api/auth/verify");
      if (status.emailVerified) {
        rememberAuthEntry("account");
        router.replace("/");
        return;
      }
      setNotice("まだ確認が完了していません。メール内のリンクを開いてから、もう一度チェックしてください。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "確認に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/auth/verify", { method: "POST" });
      setNotice("確認メールを再送しました。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "再送に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  const verifyDescription = initialEmail
    ? `確認メールを ${initialEmail} に送りました。メール内のリンクを開いてください。`
    : copy.description;

  return <section key={view} aria-labelledby="auth-title">
    <header className={styles.header}>
      <Link href={backHref} className={styles.backLink}><ChevronLeft size={18} aria-hidden="true" />戻る</Link>
    </header>
    <div className={`${styles.intro} ${motion.intro}`}>
      {view !== "login" && copy.eyebrow && <p>{copy.eyebrow}</p>}
      <h1 id="auth-title">{copy.title}</h1>
      {(view === "verify" ? verifyDescription : copy.description) && <span>{view === "verify" ? verifyDescription : copy.description}</span>}
    </div>
    <form className={`${styles.form} ${motion.controls}`} onSubmit={(event) => void onSubmit(event)}>
      {(view === "login" || view === "signup" || view === "forgot-password") && <label className={styles.field}>
        <span>メールアドレス</span>
        <span className={styles.inputWrap}><Mail aria-hidden="true" /><TextInput type="email" inputMode="email" autoComplete="email" placeholder="mail@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></span>
      </label>}
      {(view === "login" || view === "signup") && <label className={styles.field}>
        <span>パスワード</span>
        <span className={styles.inputWrap}><LockKeyhole aria-hidden="true" /><TextInput type={showPassword ? "text" : "password"} autoComplete={view === "signup" ? "new-password" : "current-password"} placeholder="8文字以上" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><IconButton className={styles.eyeButton} type="button" label={showPassword ? "パスワードを隠す" : "パスワードを表示"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff /> : <Eye />}</IconButton></span>
      </label>}
      {view === "signup" && <label className={styles.field}>
        <span>パスワード（確認）</span>
        <span className={styles.inputWrap}><LockKeyhole aria-hidden="true" /><TextInput type={showPasswordConfirm ? "text" : "password"} autoComplete="new-password" placeholder="8文字以上" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} minLength={8} required /><IconButton className={styles.eyeButton} type="button" label={showPasswordConfirm ? "パスワード（確認）を隠す" : "パスワード（確認）を表示"} onClick={() => setShowPasswordConfirm((value) => !value)}>{showPasswordConfirm ? <EyeOff /> : <Eye />}</IconButton></span>
      </label>}
      {view === "login" && <><Link className={styles.textLink} href="/auth/forgot-password">パスワードを忘れた方</Link><Button fullWidth type="submit" disabled={busy}>{busy ? "ログインしています…" : "ログイン"}</Button><p className={styles.switch}>はじめての方は <Link href="/auth/signup">アカウントを作る</Link></p></>}
      {view === "signup" && <><Button fullWidth type="submit" disabled={busy}>{busy ? "作成しています…" : "アカウントを作る"}</Button><p className={styles.switch}>すでにアカウントをお持ちですか？ <Link href="/auth/login">ログイン</Link></p></>}
      {view === "forgot-password" && <><Button fullWidth type="submit" disabled={busy}>{busy ? "送信しています…" : "再設定メールを送る"}</Button><ButtonLink fullWidth variant="secondary" href="/auth/login">ログインへ戻る</ButtonLink></>}
      {view === "verify" && <div className={styles.simpleActions}><div className={styles.status}><Check aria-hidden="true" /><span>確認メールを送信しました</span></div><Button fullWidth type="button" disabled={busy} onClick={() => void checkVerified()}>{busy ? "確認しています…" : "確認が完了したかチェック"}</Button><Button fullWidth variant="secondary" type="button" disabled={busy} onClick={() => void resendVerification()}>確認メールを再送</Button><ButtonLink fullWidth variant="ghost" href="/auth/login">別のアカウントを使う</ButtonLink></div>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </form>
  </section>;
}
