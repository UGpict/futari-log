"use client";

import { useState } from "react";
import type { MeResponse } from "@/contracts";
import {
  beginGoogleLogin,
  clientSignOut,
  continueGoogleSignIn,
} from "@/client/auth";
import { ensureAuth } from "@/client/api";
import styles from "./account-menu.module.css";

type Props = {
  me: MeResponse | null;
  onMe: (me: MeResponse) => void;
};

type Dialog =
  | { kind: "already-in-use"; message: string }
  | { kind: "cookie-only"; message: string }
  | null;

export function AccountMenu({ me, onMe }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const linkedGoogle = Boolean(me?.authProviders?.includes("google.com"));
  const showLogout = linkedGoogle;

  async function refreshMe() {
    const next = await ensureAuth();
    onMe(next);
  }

  async function onLoginClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await beginGoogleLogin();
      if (outcome.status === "linked" || outcome.status === "signed-in") {
        await refreshMe();
        return;
      }
      if (outcome.status === "credential-already-in-use") {
        setDialog({ kind: "already-in-use", message: outcome.message });
        return;
      }
      if (outcome.status === "cookie-only-warning") {
        setDialog({ kind: "cookie-only", message: outcome.message });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSwitch() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await continueGoogleSignIn();
      setDialog(null);
      await refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await clientSignOut();
      const next = await ensureAuth();
      onMe(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログアウトに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {linkedGoogle ? (
        <span className={styles.provider} title={me?.uid ?? undefined}>
          Google
        </span>
      ) : (
        <button type="button" className={styles.linkButton} disabled={busy} onClick={() => void onLoginClick()}>
          Googleでログイン
        </button>
      )}
      {showLogout && (
        <button type="button" className={styles.logoutButton} disabled={busy} onClick={() => void onLogout()}>
          ログアウト
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {dialog && (
        <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="account-dialog-title">
          <h2 id="account-dialog-title" className={styles.dialogTitle}>
            {dialog.kind === "already-in-use" ? "別アカウントへの切り替え" : "ログインの前に"}
          </h2>
          <p className={styles.dialogBody}>{dialog.message}</p>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.dialogCancel} disabled={busy} onClick={() => setDialog(null)}>
              やめる
            </button>
            <button type="button" className={styles.dialogConfirm} disabled={busy} onClick={() => void confirmSwitch()}>
              理解して続ける
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
