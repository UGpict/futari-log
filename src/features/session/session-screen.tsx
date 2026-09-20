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

function hasVisibleProposal(approval: { kind?: string; status: string; diff: { replaced: Array<{ fromSpotId: string; toSpotId: string }>; addedItemIds: string[]; removedItemIds: string[]; timeShifts: unknown[] } | null } | undefined) {
  if (!approval || approval.status !== "PENDING" || approval.kind === "MEMORY_SAVE" || approval.kind === "MEMORY_EDIT") return false;
  const diff = approval.diff;
  if (!diff) return false;
  return (
    diff.replaced.some((row) => row.fromSpotId !== row.toSpotId) ||
    diff.addedItemIds.length > 0 ||
    diff.removedItemIds.length > 0 ||
    diff.timeShifts.length > 0
  );
}

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const { data, error, reload, startReplan } = useSession(sessionId);
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
  const approval = data?.approvals.find((item) => item.status === "PENDING" && item.kind === "PLAN_APPLY");
  const proposalReady = Boolean(approval && data?.proposedPlan && hasVisibleProposal(approval));
  const attention = latest?.status === "WAITING_INPUT" || proposalReady || Boolean(approval && latest?.status === "WAITING_APPROVAL");
  if (!data && error) return <main className={styles.page}><Link className={styles.back} href="/" aria-label="カレンダーに戻る"><ArrowLeft size={18} aria-hidden="true" /></Link><h1>読み込めませんでした</h1><p role="alert">{error}</p><Button variant="secondary" size="compact" onClick={() => void reload().catch(() => undefined)}>もう一度読み込む</Button></main>;
  if (!data || (!data.plan && !failed && !attention)) return <main className={styles.page}><Link href="/" className={styles.back} aria-label="カレンダーに戻る"><ArrowLeft size={18} aria-hidden="true" /></Link><PlanLoading demo={fixturesEnabled()} /></main>;
  const input = data.session.input;
  const confirmed = ["CONFIRMED", "IN_PROGRESS", "DONE", "REFLECTED"].includes(data.session.status);
  const displayPlan = proposalReady && data.proposedPlan ? data.proposedPlan : data.plan;
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
  return <main className={styles.page} data-sheet-open={sheet ? "" : undefined}>
    <header className={styles.header}><Link href="/" className={styles.back} aria-label="カレンダーに戻る"><ArrowLeft size={18} aria-hidden="true" /></Link><span className={styles.planStatus}>{fixturesEnabled() ? "サンプル" : confirmed ? "予定に追加済み" : proposalReady ? "変更案を確認中" : active && !attention ? "変更案を作成中" : "プランを相談中"}</span><Button variant="secondary" size="compact"  onClick={() => setSheet("conditions")}><SlidersHorizontal size={14} />条件</Button></header>
    <section className={styles.hero}>
      <div className={styles.dateHeading}><h1>{new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(`${input.dateTokyo}T12:00:00+09:00`))}</h1><span className={styles.dateSticker} aria-hidden="true"><MoodSticker mood="happy" /></span></div>
      <div className={styles.facts}><span><CalendarHeart size={13} />{input.startTime}–{input.endTime}</span><span><Wallet size={13} />{budgetLabel}<small>ふたり分</small></span><span>{displayPlan?.items.length ?? 0}スポット</span></div>
    </section>
    {(error || actionError) && !sheet && <p className={styles.notice} role="alert">{actionError || error}</p>}
    {message && <p className={styles.statusMessage} role="status"><Check size={14} />{message}</p>}
    {active && !attention && <p className={styles.statusMessage} role="status">変更案を考えています。このまま少しお待ちください。</p>}
    {failed && <div className={styles.notice} role="alert"><strong>プランを作り直せませんでした</strong><p>{latest?.error || "時間をおいて、もう一度お試しください。"}</p><Button variant="secondary" size="compact" disabled={pending} onClick={() => void act(`/api/sessions/${sessionId}/runs`, { kind: data.plan ? "REPLAN" : "INITIAL_PLAN", trigger: latest?.trigger, instruction: latest?.instruction ?? undefined, targetPlanItemId: latest?.targetPlanItemId ?? undefined, basePlanVersion: data.session.currentPlanVersion ?? undefined }, "再度プランを考えています")}>もう一度試す</Button></div>}
    {proposalReady && approval && data.proposedPlan && <section className={styles.approval}><strong>変更案が届きました</strong><p>{approval.diff?.summary || approval.summary}</p><div className={styles.proposalCompare}>{(approval.diff?.replaced.length ? approval.diff.replaced : []).map((row) => {
      const fromItem = data.plan?.items.find((item) => item.id === row.fromItemId);
      const toItem = data.proposedPlan?.items.find((item) => item.id === row.toItemId);
      return <div key={`${row.fromItemId}:${row.toItemId}`} className={styles.proposalRow}><div><small>現在</small><strong>{data.spots[row.fromSpotId]?.name ?? row.fromSpotId}</strong><span>{fromItem ? `${formatTokyoHm(fromItem.startAt)}–${formatTokyoHm(fromItem.endAt)}` : ""}</span></div><div><small>変更案</small><strong>{data.spots[row.toSpotId]?.name ?? row.toSpotId}</strong><span>{toItem ? `${formatTokyoHm(toItem.startAt)}–${formatTokyoHm(toItem.endAt)}` : ""}</span></div></div>;
    })}{(approval.diff?.timeShifts ?? []).map((shift) => {
      const currentItem = data.plan?.items.find((item) => item.spotId === data.proposedPlan?.items.find((next) => next.id === shift.itemId)?.spotId);
      const proposedItem = data.proposedPlan?.items.find((item) => item.id === shift.itemId);
      if (!proposedItem) return null;
      return <div key={shift.itemId} className={styles.proposalRow}><div><small>現在</small><strong>{data.spots[proposedItem.spotId]?.name ?? proposedItem.spotId}</strong><span>{currentItem ? `${formatTokyoHm(currentItem.startAt)}–${formatTokyoHm(currentItem.endAt)}` : ""}</span></div><div><small>変更案</small><strong>{data.spots[proposedItem.spotId]?.name ?? proposedItem.spotId}</strong><span>{`${formatTokyoHm(proposedItem.startAt)}–${formatTokyoHm(proposedItem.endAt)}`}</span></div></div>;
    })}</div><small>{data.proposedPlan.assumptions.find((line) => line.startsWith("希望「")) || "内容を確認してから、プランに反映できます。"}</small><div className={styles.buttonRow}><Button variant="primary" size="compact" disabled={pending} onClick={() => void act(`/api/approvals/${approval.id}/decision`, { decision: "APPROVE" }, "変更を反映しました")}>この変更にする</Button><Button variant="secondary" size="compact" disabled={pending} onClick={() => void act(`/api/approvals/${approval.id}/decision`, { decision: "REJECT" }, "元のプランを残しました")}>元のままにする</Button></div></section>}
    {approval && !proposalReady && latest?.status === "WAITING_APPROVAL" && <section className={styles.approval}><strong>条件に合う別の候補が見つかりませんでした。条件を変えて探しますか？</strong><div className={styles.buttonRow}><Button variant="secondary" size="compact" disabled={pending} onClick={() => void act(`/api/approvals/${approval.id}/decision`, { decision: "REJECT" }, "元のプランを残しました")}>元のままにする</Button></div></section>}
    {latest?.status === "WAITING_INPUT" && latest.waitingQuestion && <section className={styles.approval}><strong>{latest.waitingQuestion.prompt}</strong><div className={styles.buttonRow}>{latest.waitingQuestion.options.map((answer) => <Button variant="secondary" size="compact" key={answer} disabled={pending} onClick={() => void act(`/api/runs/${latest.id}/answers`, { questionId: latest.waitingQuestion!.id, answer }, "回答を送りました")}>{answer}</Button>)}</div></section>}
    {!!displayPlan?.validation.issues.length && <section className={styles.notice}><strong>お出かけ前に確認</strong>{displayPlan.validation.issues.map((issue, index) => <p key={index}>{issue.message}</p>)}</section>}
    <section className={styles.itinerary} aria-label="この日のスケジュール"><h2 className="sr-only">この日のスケジュール</h2>
      <div className={styles.meeting}><span className={styles.endpointIcon}><MapPin size={17} /></span><div><small>{input.startTime} 集合</small><strong>{input.meet.name}</strong></div></div>
      <ol>{displayPlan?.items.map((item, index) => {
        const spot = data.spots[item.spotId];
        const visual = spotVisual(spot?.name ?? "", spot?.categories ?? []);
        const duration = Math.max(0, Math.round((Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000));
        const next = displayPlan?.items[index + 1];
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
      {!displayPlan?.items.length && <p className={styles.notice}>表示できる行程がまだありません。</p>}
      <div className={styles.meeting}><span className={styles.endpointIcon}><Check size={17} /></span><div><small>{input.endTime}ごろ 解散</small><strong>{input.end.name}</strong></div></div>
    </section>
    {!["DONE", "REFLECTED"].includes(data.session.status) && <button className={styles.wholeFeedback} disabled={Boolean(active) || pending} onClick={() => openFeedback()}><MoodSticker mood="relaxed" /><span><strong>もう少し、こんな一日にしたい</strong><small>プラン全体の希望を伝える</small></span><ArrowUpRight size={16} /></button>}
    <footer className={styles.footer} inert={sheet ? true : undefined}>{confirmed ? <ButtonLink variant="secondary" fullWidth href="/"><Check size={17} />カレンダーで予定を見る</ButtonLink> : <Button fullWidth disabled={saving || pending || Boolean(active) || !data.plan?.items.length || data.plan.validation.state === "FAIL" || Boolean(attention)} onClick={async () => { setSaving(true); try { await act(`/api/sessions/${sessionId}/progress`, { confirm: true, status: "CONFIRMED" }, "カレンダーに予定を追加しました"); } finally { setSaving(false); } }}>{saving ? "保存しています…" : "このプランで決める"}<Check size={17} /></Button>}</footer>
    {sheet === "feedback" && <HomeSheet title={target ? "ここ、少し変えよう" : "プランの希望を伝える"} onClose={() => setSheet(null)}>
      <form className={styles.feedbackForm} onSubmit={async (event) => {
        event.preventDefault();
        if (!feedback.trim() || pending) return;
        const version = data.session.currentPlanVersion;
        if (version == null) { setActionError("表示中のプランを読み込めませんでした。画面を更新してからもう一度。"); return; }
        setPending(true); setActionError(""); setMessage("");
        try {
          await startReplan({ instruction: feedback.trim(), targetPlanItemId: target?.id, basePlanVersion: version });
          setMessage("希望を送りました。変更案を考えています。");
          setSheet(null);
        } catch (error) {
          const raw = error instanceof Error ? error.message : "保存できませんでした。もう一度お試しください。";
          if (raw === "stale version") {
            setActionError("プランが更新されています。画面を更新してからもう一度。");
            await reload().catch(() => undefined);
          } else if (raw.startsWith("concurrent run")) {
            setActionError("いま変更案を考えています。終わるまで待ってから、もう一度送ってください。");
          } else {
            setActionError(raw);
          }
        } finally { setPending(false); }
      }}>
        <div className={styles.feedbackIntro}><MoodSticker mood="relaxed" /><div><strong>{target?.name ?? "一日の過ごし方"}</strong><p>気になることを、ひとこと教えてね。</p></div></div>
        {target?.locked && <p className={styles.fieldHint}>時間が決まっている予定です。固定条件を守れる範囲で調整します。</p>}
        <div className={styles.quickOptions}>{["別の場所がいい", "もう少し予算を抑えたい", "ゆっくり過ごしたい", "移動を少なくしたい"].map((text) => <Button variant="secondary" size="compact" type="button" key={text} disabled={pending} onClick={() => setFeedback((value) => value ? `${value}
${text}` : text)}>{text}</Button>)}</div>
        <label className={styles.feedbackLabel}>どんなふうに変えたい？<textarea autoFocus rows={3} maxLength={1000} value={feedback} disabled={pending} onChange={(event) => setFeedback(event.target.value)} placeholder="例えば、ここは行ったことがあるから、別の美術館がいいな。" /></label>
        <p className={styles.fieldHint}>{fixturesEnabled() ? "現在は操作確認用のサンプルです。" : "固定・訪問中・完了済みの予定は維持して考え直します。"}</p>
        {actionError && <p className={styles.notice} role="alert">{actionError}</p>}
        <Button fullWidth type="submit" disabled={!feedback.trim() || pending}>{pending ? "送っています…" : "この希望で考え直す"}<ArrowUpRight size={17} /></Button>
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
