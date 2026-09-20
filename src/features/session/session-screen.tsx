"use client";

import { Button, ButtonLink } from "@/components/button";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { ArrowLeft, CalendarHeart, Wallet, Check, MessageCircle, SlidersHorizontal, ArrowUpRight, ExternalLink, Clock3, Coffee, Landmark, Trees, MapPin } from "lucide-react";
import { useSession } from "@/client/hooks/use-session";
import { api, fixturesEnabled } from "@/client/api";
import { formatTokyoHm } from "@/lib/time";
import { PlanLoading } from "./plan-loading";
import { HomeSheet } from "../home/home-sheet";
import { MoodSticker } from "@/components/mood-sticker";
import styles from "./session.module.css";

// Presentation-only placeholders until sourced venue photos are available in the API.
function spotVisual(name: string, categories: string[]) {
  const text = `${name} ${categories.join(" ")}`;
  if (/美術館|博物館|展示|museum|gallery/i.test(text)) return { image: "museum", label: "アート・展示", Icon: Landmark };
  if (/公園|森|庭園|散歩|park|garden/i.test(text)) return { image: "nature", label: "散策", Icon: Trees };
  if (/カフェ|喫茶|コーヒー|ケーキ|ハーブス|cafe|coffee|bakery/i.test(text)) return { image: "cafe", label: "カフェ", Icon: Coffee };
  return { image: null, label: "立ち寄りスポット", Icon: MapPin };
}

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const { data, error, reload } = useSession(sessionId);
  const [sheet, setSheet] = useState<"conditions" | "feedback" | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string; locked: boolean } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const latest = data?.runs.at(-1);
  const failed = latest && ["FAILED", "CANCELLED", "INTERRUPTED"].includes(latest.status);
  const active = data?.runs.some((run) => ["PENDING", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL"].includes(run.status));
  const approval = data?.approvals.find((item) => item.status === "PENDING");
  const attention = latest?.status === "WAITING_INPUT" || data?.approvals.some((item) => item.status === "PENDING");
  if (!data && error) return <main className={styles.page}><Link className={styles.back} href="/" aria-label="カレンダーに戻る"><ArrowLeft size={18} aria-hidden="true" /></Link><h1>読み込めませんでした</h1><p role="alert">{error}</p><Button variant="secondary" size="compact" onClick={() => void reload().catch(() => undefined)}>もう一度読み込む</Button></main>;
  if (!data || (!data.plan && !failed && !attention)) return <main className={styles.page}><Link href="/" className={styles.back} aria-label="カレンダーに戻る"><ArrowLeft size={18} aria-hidden="true" /></Link><PlanLoading demo={fixturesEnabled()} /></main>;
  const input = data.session.input;
  const confirmed = ["CONFIRMED", "IN_PROGRESS", "DONE", "REFLECTED"].includes(data.session.status);
  const budget = [input.budget.mealsJpy, input.budget.facilitiesJpy, input.budget.transitJpy];
  const budgetLabel = budget.every((value) => value !== null) ? `¥${budget.reduce<number>((sum, value) => sum + (value ?? 0), 0).toLocaleString()}` : "未設定あり";
  async function act(path: string, body: unknown, success: string) {
    if (pending) return false;
    setPending(true); setActionError(""); setMessage("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      setMessage(success);
      await reload();
      return true;
    } catch (error) { setActionError(error instanceof Error ? error.message : "保存できませんでした。もう一度お試しください。"); return false; }
    finally { setPending(false); }
  }
  function openFeedback(item?: { id: string; name: string; locked: boolean }) {
    setTarget(item ?? null); setFeedback(""); setActionError(""); setSheet("feedback");
  }
  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="カレンダーに戻る"><ArrowLeft size={18} aria-hidden="true" /></Link><span className={styles.planStatus}>{fixturesEnabled() ? "サンプル" : confirmed ? "予定に追加済み" : "プランを相談中"}</span><Button variant="secondary" size="compact"  onClick={() => setSheet("conditions")}><SlidersHorizontal size={14} />条件</Button></header>
    <section className={styles.hero}>
      <div className={styles.dateHeading}><h1>{new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(`${input.dateTokyo}T12:00:00+09:00`))}</h1><span className={styles.dateSticker} aria-hidden="true"><MoodSticker mood="happy" /></span></div>
      <div className={styles.facts}><span><CalendarHeart size={13} />{input.startTime}–{input.endTime}</span><span><Wallet size={13} />{budgetLabel}<small>ふたり分</small></span><span>{data.plan?.items.length ?? 0}スポット</span></div>
    </section>
    {(error || actionError) && !sheet && <p className={styles.notice} role="alert">{actionError || error}</p>}
    {message && <p className={styles.statusMessage} role="status"><Check size={14} />{message}</p>}
    {active && !attention && <p className={styles.statusMessage} role="status">変更案を考えています。このまま少しお待ちください。</p>}
    {failed && <div className={styles.notice} role="alert"><strong>プランを作り直せませんでした</strong><p>{latest?.error || "時間をおいて、もう一度お試しください。"}</p><Button variant="secondary" size="compact" disabled={pending || active} onClick={() => void act(`/api/sessions/${sessionId}/runs`, { kind: data.plan ? "REPLAN" : "INITIAL_PLAN", trigger: latest?.trigger }, "再度プランを考えています")}>もう一度試す</Button></div>}
    {approval && <section className={styles.approval}><strong>変更案が届きました</strong><p>{approval.diff?.summary || approval.summary}</p><small>内容を確認してから、プランに反映できます。</small><div className={styles.buttonRow}><Button variant="primary" size="compact" disabled={pending} onClick={() => void act(`/api/approvals/${approval.id}/decision`, { decision: "APPROVE" }, "変更を反映しました")}>この変更にする</Button><Button variant="secondary" size="compact" disabled={pending} onClick={() => void act(`/api/approvals/${approval.id}/decision`, { decision: "REJECT" }, "元のプランを残しました")}>元のままにする</Button></div></section>}
    {latest?.status === "WAITING_INPUT" && latest.waitingQuestion && <section className={styles.approval}><strong>{latest.waitingQuestion.prompt}</strong><div className={styles.buttonRow}>{latest.waitingQuestion.options.map((answer) => <Button variant="secondary" size="compact" key={answer} disabled={pending} onClick={() => void act(`/api/runs/${latest.id}/answers`, { questionId: latest.waitingQuestion!.id, answer }, "回答を送りました")}>{answer}</Button>)}</div></section>}
    {!!data.plan?.validation.issues.length && <section className={styles.notice}><strong>お出かけ前に確認</strong>{data.plan.validation.issues.map((issue, index) => <p key={index}>{issue.message}</p>)}</section>}
    <section className={styles.itinerary} aria-label="この日のスケジュール"><h2 className="sr-only">この日のスケジュール</h2>
      <div className={styles.meeting}><span className={styles.endpointIcon}><MapPin size={17} /></span><div><small>{input.startTime} 集合</small><strong>{input.meet.name}</strong></div></div>
      <ol>{data.plan?.items.map((item, index) => {
        const spot = data.spots[item.spotId];
        const visual = spotVisual(spot?.name ?? "", spot?.categories ?? []);
        const duration = Math.max(0, Math.round((Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000));
        const next = data.plan?.items[index + 1];
        const gap = next ? Math.round((Date.parse(next.startAt) - Date.parse(item.endAt)) / 60000) : 0;
        return <li key={item.id}>
          <div className={styles.timelineTime}><time dateTime={item.startAt}>{formatTokyoHm(item.startAt)}</time><span data-kind={visual.image}><visual.Icon size={19} /></span></div>
          <div className={styles.stop}>
            <article className={styles.spot}>
              {visual.image && <div className={styles.spotImage}><Image src={`/images/itinerary/${visual.image}.jpg`} alt={`${visual.label}のイメージ写真（実際の施設とは異なります）`} fill sizes="(max-width: 430px) 76vw, 330px" /><span className={styles.photoLabel}>イメージ</span></div>}
              <div className={styles.spotBody}>
                <div className={styles.spotTop}><span className={styles.category}>{visual.label}</span><small><Clock3 size={12} />{duration}分</small>{item.locked && <small>時間固定</small>}{item.progress === "DONE" && <small><Check size={12} />訪問済み</small>}</div>
                <h3>{spot?.name ?? "立ち寄りスポット"}</h3>
                <p>{item.reason}</p>
                <div className={styles.spotFoot}><span>{spot?.costForTwoJpy.value ? (spot.costForTwoJpy.value.max === 0 ? "無料" : `¥${spot.costForTwoJpy.value.max.toLocaleString()}まで / ふたり`) : "料金は要確認"}</span>{spot?.officialUrl && <a href={spot.officialUrl} target="_blank" rel="noreferrer">公式サイト <ExternalLink size={12} /></a>}</div>
                {!["DONE", "REFLECTED"].includes(data.session.status) && <button className={styles.changeSpot} disabled={Boolean(active) || pending} onClick={() => openFeedback({ id: item.id, name: spot?.name ?? "このスポット", locked: item.locked })}><MessageCircle size={14} />ここを変えたい<ArrowUpRight size={13} /></button>}
              </div>
            </article>
            {gap > 0 && <p className={styles.transition}><span />次の予定まで {gap}分<small>移動・ひと休み</small></p>}
          </div>
        </li>;
      })}</ol>
      {!data.plan?.items.length && <p className={styles.notice}>表示できる行程がまだありません。</p>}
      <div className={styles.meeting}><span className={styles.endpointIcon}><Check size={17} /></span><div><small>{input.endTime}ごろ 解散</small><strong>{input.end.name}</strong></div></div>
    </section>
    {!["DONE", "REFLECTED"].includes(data.session.status) && <button className={styles.wholeFeedback} disabled={Boolean(active) || pending} onClick={() => openFeedback()}><MoodSticker mood="relaxed" /><span><strong>もう少し、こんな一日にしたい</strong><small>プラン全体の希望を伝える</small></span><ArrowUpRight size={16} /></button>}
    <footer className={styles.footer}>{confirmed ? <ButtonLink variant="secondary" fullWidth href="/"><Check size={17} />カレンダーで予定を見る</ButtonLink> : <Button fullWidth disabled={saving || pending || Boolean(active) || !data.plan?.items.length || data.plan.validation.state === "FAIL" || Boolean(attention)} onClick={async () => { setSaving(true); try { await act(`/api/sessions/${sessionId}/progress`, { confirm: true, status: "CONFIRMED" }, "カレンダーに予定を追加しました"); } finally { setSaving(false); } }}>{saving ? "保存しています…" : "このプランで決める"}<Check size={17} /></Button>}</footer>
    {sheet === "feedback" && <HomeSheet title={target ? "ここ、少し変えよう" : "プランの希望を伝える"} onClose={() => setSheet(null)}>
      <form className={styles.feedbackForm} onSubmit={async (event) => {
        event.preventDefault();
        if (!feedback.trim() || pending || active || !fixturesEnabled()) return;
        const trigger = `${target ? `対象: ${target.name}（行程ID: ${target.id}）。` : "プラン全体について。"}希望: ${feedback.trim()}。固定予定と訪問済みの予定は維持し、必要な前後の予定も調整してください。`;
        if (await act(`/api/sessions/${sessionId}/runs`, { kind: "REPLAN", trigger }, fixturesEnabled() ? "サンプルとして希望を受け付けました。実際の再提案は行いません。" : "希望を送りました。変更案を考えています。")) setSheet(null);
      }}>
        <div className={styles.feedbackIntro}><MoodSticker mood="relaxed" /><div><strong>{target?.name ?? "一日の過ごし方"}</strong><p>気になることを、ひとこと教えてね。</p></div></div>
        {target?.locked && <p className={styles.fieldHint}>時間が決まっている予定です。固定条件を守れる範囲で調整します。</p>}
        <div className={styles.quickOptions}>{["別の場所がいい", "もう少し予算を抑えたい", "ゆっくり過ごしたい", "移動を少なくしたい"].map((text) => <Button variant="secondary" size="compact" type="button" key={text} disabled={pending} onClick={() => setFeedback((value) => value ? `${value}
${text}` : text)}>{text}</Button>)}</div>
        <label className={styles.feedbackLabel}>どんなふうに変えたい？<textarea autoFocus rows={3} maxLength={1000} value={feedback} disabled={pending} onChange={(event) => setFeedback(event.target.value)} placeholder="例えば、ここは行ったことがあるから、別の美術館がいいな。" /></label>
        <p className={styles.fieldHint}>{fixturesEnabled() ? "現在は操作確認用のサンプルです。" : "変更希望の送信は準備中です。"}</p>
        {actionError && <p className={styles.notice} role="alert">{actionError}</p>}
        <Button fullWidth type="submit" disabled={!feedback.trim() || pending || Boolean(active) || !fixturesEnabled()}>{pending ? "送っています…" : "この希望で考え直す"}<ArrowUpRight size={17} /></Button>
      </form>
    </HomeSheet>}
    {sheet === "conditions" && <HomeSheet title="プランをつくった条件" onClose={() => setSheet(null)}>
      <div className={styles.conditionSheet}><p>最初の3ステップで入力した内容です。</p><dl><dt>時間</dt><dd>{input.startTime}〜{input.endTime}</dd><dt>集合 → 解散</dt><dd>{input.meet.name} → {input.end.name}</dd><dt>ふたりの予算</dt><dd>{budgetLabel}</dd></dl>
        <h3>伝えた希望</h3>{input.preferences.map((item) => <p className={styles.preference} key={item.id}>{item.content}</p>)}
        {!!data.plan?.assumptions.length && <><h3>まだ確認できていないこと</h3>{data.plan.assumptions.map((item) => <p key={item}>{item}</p>)}</>}
        {!!data.plan?.planB.length && <><h3>予定が変わったら</h3>{data.plan.planB.map((item) => <p key={item.id}><strong>{item.trigger}</strong><br />{item.isVerifiedAlternative && item.candidateSpotId ? data.spots[item.candidateSpotId]?.name : item.policy || "代わりのプランを検討します"}</p>)}</>}
      </div>
    </HomeSheet>}
  </main>;
}
