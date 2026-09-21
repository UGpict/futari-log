"use client";

import { TextInput, SelectInput } from "@/components/text-input";

import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { Button, ButtonLink, IconButton } from "@/components/button";
import { Card } from "@/components/card";
import { Field } from "@/components/field";
import { FutariLogo } from "@/components/futari-logo";
import { MemoComposer } from "@/components/memo-composer";
import { Toast } from "@/components/toast";
import { DateCreateButton } from "@/components/date-create-button";
import { MoodSticker, moods } from "@/components/mood-sticker";
import { MemoMascot } from "@/components/memo-mascot";
import { RiveMascot } from "@/components/rive-mascot";
import { HomeSheet } from "@/features/home/home-sheet";
import { PlanLoading } from "@/features/session/plan-loading";
import { fallbackSpotVisual, spotVisuals } from "@/features/session/spot-visuals";
import type { CatalogData } from "./catalog-types";
import styles from "./component-catalog.module.css";

const tokenLabels = Object.fromEntries([
  ["--action-primary", "メイン操作 / グラデーション"],
  ["--action-primary-start", "メイン / 始点"], ["--action-primary-middle", "メイン / 中央"], ["--action-primary-end", "メイン / 終点"],
  ["--action-primary-hover", "メイン操作 / hover"], ["--action-on-primary", "メイン操作上の文字"],
  ["--surface-page", "ページ背景"], ["--surface-card", "カード背景"], ["--surface-accent", "補助背景"],
  ["--text-primary", "本文"], ["--text-muted", "補足文字"], ["--text-accent", "強調文字"], ["--text-danger", "削除・エラー"],
  ["--border-control", "枠線"], ["--focus-ring", "キーボードフォーカス"],
  ["--color-paper-deep", "旧パレット / チップ背景"], ["--color-rose", "旧パレット / rose"], ["--color-rose-hover", "旧パレット / hover"], ["--color-rose-soft", "旧パレット / 背景"],
  ["--color-moss", "成功文字"], ["--color-moss-soft", "成功背景"], ["--color-amber", "注意文字"], ["--color-amber-soft", "注意背景"],
]);
const migrations = [
  ["メモの追加・保存・キャンセル・編集・削除", "src/features/memory/memory-screen.tsx", "Button / secondary / ghost / IconButton", "独自グラデーション、保存色、操作サイズが共通ボタンと異なる。最優先で置き換え。"],
  ["入力欄・テキストエリア", "home/plan-form・home/home-screen・memory/memory-screen・session/session-screen・session/session-details", "Field + TextInput / TextArea / SelectInput", "全入力を共通部品へ移行済み。最小16px・44pxの操作領域を共通化。色と枠は各画面で維持。"],
  ["選択チップ・予算・時間帯", "src/features/home/plan-form.tsx", "専用の選択コンポーネントへ抽出", "aria-pressed を持つ選択操作。通常ボタンと区別し、選択状態を統一。"],
  ["カレンダー・写真カード・デート作成マーク", "src/features/home/home-screen.tsx", "専用表現を維持して抽出", "日付・写真・マスコットの表現を残し、文字色と背景を意味別トークンへ。"],
  ["スポットカード・プランへのフィードバック", "src/features/session/session-screen.tsx", "専用カード / 共通ボタン", "カード内の変更操作と、全体の希望を伝えるカードを分けて整理。"],
  ["メモカード・空状態・通知", "src/features/memory/memory-screen.tsx", "共通カード・状態表示（要設計）", "Card は見出し付きセクション用。用途の違うカードを無理に同じ構造にしない。"],
  ["ボトムシート / FeedbackEditor", "src/features/home/home-sheet.tsx・home-screen.tsx", "HomeSheet / 入力部品", "HomeSheet は再利用できる実装。FeedbackEditor はホーム内に閉じた部品。"],
];

function Example({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <article className={styles.example}><header><h3>{name}</h3><p>{note}</p></header><div className={styles.preview}>{children}</div></article>;
}

export function ComponentCatalog({ inventory, literalColors, colorTokens }: CatalogData) {
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("すべて");
  const [message, setMessage] = useState("操作すると、ここに結果が表示されます。");
  const [sheet, setSheet] = useState(false);
  const [cue, setCue] = useState(0);
  const [loading, setLoading] = useState(false);
  const visible = inventory.filter(item => `${item.name} ${item.file} ${item.usages.map(u => u.file).join(" ")}`.toLowerCase().includes(query.toLowerCase()) && (filter === "すべて" || (filter === "共通" ? item.kind === "共通" : filter === "単一ファイル" ? item.usages.length === 1 : item.usages.length === 0)));
  return <main className={styles.page}>
    <header className={styles.hero}><ButtonLink href="/" variant="secondary" size="compact"><ArrowLeft />アプリへ戻る</ButtonLink><p className={styles.eyebrow}>FUTARILOG / DEVELOPMENT ONLY</p><h1>コンポーネント一覧</h1><p>今ある部品を見比べて、ふたりログの見た目を揃える。</p><p className={styles.caption}>プレビューは実際のコンポーネントを使用。サンプル操作はこのページ内で完結します。</p></header>
    <nav className={styles.nav} aria-label="一覧の目次">{[["examples", "実物プレビュー"], ["tokens", "色と基準"], ["inventory", "全コンポーネント"], ["migration", "統一候補"]].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
    <section id="examples" className={styles.section}><h2>実物プレビュー</h2><p>hover はマウス、focus は Tab キーで確認できます。</p><div className={styles.grid}>
      <Example name="Button" note="決定・保存は primary。補助操作は secondary。">
        {(["primary", "secondary", "ghost", "danger"] as const).map(variant => <div className={styles.row} key={variant}><code>{variant}</code><Button variant={variant} onClick={() => setMessage(`${variant} を押しました`)}>保存する</Button><Button variant={variant} disabled>無効</Button><Button variant={variant} size="compact" onClick={() => setMessage(`${variant} / compact を押しました`)}>小さめ</Button></div>)}
        <Button fullWidth onClick={() => setMessage("横幅いっぱいのボタンを押しました")}><Plus />新しいデートをつくる</Button><p role="status">{message}</p>
      </Example>
      <Example name="ButtonLink / IconButton" note="遷移にはリンク。アイコン操作はメインカラーのベタ塗り・枠なし・白アイコン。読み上げラベルは必須。"><div className={styles.row}><ButtonLink href="#inventory" variant="secondary">使用箇所を見る</ButtonLink><IconButton label="完了のサンプル" onClick={() => setMessage("完了しました")}><Check /></IconButton><IconButton label="無効な閉じる操作" disabled><X /></IconButton></div></Example>
      <Example name="Card / Field" note="Card は見出し付きセクション。Field はラベル枠のみ。使用状況は自動取得する台帳で確認。"><Card title="ふたりのメモ"><Field label="タイトル"><TextInput className={styles.sampleInput} placeholder="のんびり過ごす一日" /></Field></Card><p>入力は共通 TextInput。文字サイズは16px以上、操作領域は44px以上。</p></Example>
      <Example name="FutariLogo" note="ブランドのロゴ。"><FutariLogo className={styles.logo} /></Example>
      <Example name="DateCreateButton" note="ホーム右下と同じ新規追加ボタン。円周の文字・丸い背景・プラスアイコンを含む実物です。"><DateCreateButton onClick={() => setMessage("新規追加ボタンを押しました")} /><p role="status">{message}</p></Example>
      <Example name="MemoComposer / Toast" note="実画面と同じ、最初から入力できるメモ追加フォーム。追加すると画面上部に約2秒間通知します。"><MemoComposer onAdd={() => setToast("メモを追加しました")} /><Toast message={toast} onDismiss={() => setToast("")} /></Example>
      <Example name="MoodSticker" note="気持ちの4種類。色はイラスト専用パレット。"><div className={styles.row}>{moods.map(mood => <figure key={mood.id}><MoodSticker mood={mood.id} className={styles.sticker} /><figcaption>{mood.label}</figcaption></figure>)}</div></Example>
      <Example name="RiveMascot / MemoMascot" note="weather・memo・suggestion と、次の動きを呼ぶラッパー。"><div className={styles.row}>{(["weather", "memo", "suggestion"] as const).map(variant => <figure key={variant}><RiveMascot variant={variant} /><figcaption>{variant}</figcaption></figure>)}<MemoMascot nextCue={cue} /></div><Button variant="secondary" size="compact" onClick={() => setCue(cue + 1)}>MemoMascot の次の動き</Button></Example>
      <Example name="HomeSheet" note="ホームで使用するダイアログ。背景クリック・Esc・閉じるを確認。"><Button variant="secondary" onClick={() => setSheet(true)}>シートを開く</Button>{sheet && <HomeSheet title="シートのサンプル" onClose={() => setSheet(false)}><p>実際の HomeSheet です。</p><Button fullWidth onClick={() => setSheet(false)}>閉じる</Button></HomeSheet>}</Example>
      <Example name="PlanLoading" note="プラン生成中の表示。データ取得せず見た目だけ確認。"><Button variant="secondary" onClick={() => setLoading(!loading)} aria-expanded={loading}>{loading ? "プレビューを閉じる" : "読み込み表示を見る"}</Button>{loading && <PlanLoading demo />}</Example>
      <Example name="Spot category icons" note={`スポットカードで使う${spotVisuals.length + 1}種類。名前・カテゴリから自動判定し、一致しない場合は「その他」になります。`}><div className={styles.spotIconGrid}>{[...spotVisuals, fallbackSpotVisual].map(({ id, label, examples, Icon, tone }) => <figure key={id} data-tone={tone}><span><Icon size={24} /></span><figcaption><strong>{label}</strong><small>{examples}</small></figcaption></figure>)}</div></Example>
    </div></section>
    <section id="tokens" className={styles.section}><h2>色と基準</h2><p>定義元：src/app/globals.css。統一時は色コードをコピーせず、用途に合う変数を参照します。</p><div className={styles.swatches}>{colorTokens.map(({ token, value }) => <article key={token}><span className={styles.swatch} style={{ background: value }} /><strong>{tokenLabels[token] ?? token}</strong><code>{token}</code><code>{value}</code></article>)}</div><div className={styles.rules}><p>本文：<span style={{color:"var(--text-primary)"}}>text-primary</span> / 補足：<span style={{color:"var(--text-muted)"}}>text-muted</span> / 強調：<span style={{color:"var(--text-accent)"}}>text-accent</span></p><p>寸法・角丸・無効状態は globals.css と button.module.css の定義を実物プレビューに反映しています。</p><p>見た目の基準は既存値です。文字のコントラストを含め、採用する色はここで比較して調整してください。</p></div>
    <details><summary>画面CSSに直接書かれた色：{literalColors.length}色（整理対象）</summary><p>イラスト・写真上の表示・透明色も含みます。すべてを同じ色に置き換える必要はありません。</p><div className={styles.swatches}>{literalColors.map(item => <article key={item.color}><span className={styles.swatch} style={{background:item.color}} /><code>{item.color} / {item.count}箇所</code><small>{item.files.join(" / ")}</small></article>)}</div></details></section>
    <section id="inventory" className={styles.section}><h2>全コンポーネントの台帳</h2><p>共通・画面・画面内関数コンポーネント {inventory.length}件。ページを開くたびに現在のソースから自動取得。開発ページ自身と薄いルート入口は除外。使用数は JSX を記述したファイル数で、表示画面数ではありません。</p><div className={styles.controls}><label>名前・パスで検索<TextInput value={query} onChange={event => setQuery(event.target.value)} placeholder="Button / memory …" /></label><label>絞り込み<SelectInput value={filter} onChange={event => setFilter(event.target.value)}>{["すべて", "共通", "単一ファイル", "未使用"].map(value => <option key={value}>{value}</option>)}</SelectInput></label></div><p aria-live="polite">{visible.length}件</p><div className={styles.tableWrap}><table><thead><tr><th>コンポーネント / 定義元</th><th>分類</th><th>使用ファイル</th></tr></thead><tbody>{visible.map(item => <tr key={item.name}><td><strong>{item.name}</strong><code>{item.file}</code></td><td>{item.kind}<br /><span>{item.usages.length === 0 ? "未使用" : `${item.usages.length}ファイル`}</span></td><td>{item.usages.length ? item.usages.map(usage => <code key={usage.file}>{usage.file}（{usage.count}箇所）</code>) : "既存画面の使用なし"}</td></tr>)}</tbody></table></div>{!visible.length && <p>一致するコンポーネントがありません。</p>}<p>HomeScreen・PlanForm・FeedbackEditor・MemoryScreen・SessionScreen・SessionDetails・ReplayScreen は、認証・データ取得・保存と結びつくため台帳で掲載しています。画面内の未抽出 UI は下の統一候補に記載しています。</p></section>
    <section id="migration" className={styles.section}><h2>統一・置き換え候補</h2><p>以下は初回調査時点の提案です。現在の実装状況は上の自動取得する台帳・色一覧を参照してください。</p><p>まず共通ボタンと文字色を揃え、次に入力・カードを整理する順番です。単一ファイルでの使用だけでは、共通化すべきかは判断しません。</p><div className={styles.grid}>{migrations.map(([name, file, target, note]) => <article key={name} className={styles.example}><h3>{name}</h3><code>{file}</code><p><strong>移行先：</strong>{target}</p><p>{note}</p></article>)}</div></section>
  </main>;
}
