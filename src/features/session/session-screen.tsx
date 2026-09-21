"use client";

import { TextArea } from "@/components/text-input";

import { Button, ButtonLink } from "@/components/button";

import { useState } from "react";
import { Check, MessageCircle, ArrowUpRight, ExternalLink, Clock3 } from "lucide-react";
import { useSession } from "@/client/hooks/use-session";
import { usePlacePhotos } from "@/client/hooks/use-place-photos";
import { api, fixturesEnabled } from "@/client/api";
import { formatTokyoHm } from "@/lib/time";
import { PlanLoading, PlanningAgentTicker } from "./plan-loading";
import { HomeSheet } from "../home/home-sheet";
import { PlanStickerIcon } from "@/components/plan-sticker-icon";
import { MoodSticker } from "@/components/mood-sticker";
import { Toast } from "@/components/toast";
import { HomeLogo } from "@/components/home-logo";
import { SpotCardImage } from "./spot-photo";
import { spotVisual } from "./spot-visuals";
import type { SessionSnapshot } from "@/contracts";
import styles from "./session.module.css";

function hasVisibleProposal(approval: {
  kind?: string;
  status: string;
  diff: {
    replaced: Array<{ fromSpotId: string; toSpotId: string }>;
    addedItemIds: string[];
    removedItemIds: string[];
    timeShifts: unknown[];
  } | null;
} | undefined) {
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

function travelFact(mode: "WALK" | "TRANSIT" | "DRIVE" | undefined) {
  if (mode === "DRIVE") return { label: "車", icon: "drive" as const };
  if (mode === "TRANSIT") return { label: "交通機関", icon: "transit" as const };
  return { label: "徒歩", icon: "walk" as const };
}

function SessionPlanningSkeleton({ data }: { data: SessionSnapshot | null }) {
  const input = data?.session.input;
  const budget = input ? [input.budget.mealsJpy, input.budget.facilitiesJpy, input.budget.transitJpy] : [];
  const budgetLabel = budget.length && budget.every((value) => value !== null)
    ? `¥${budget.reduce<number>((sum, value) => sum + (value ?? 0), 0).toLocaleString()}`
    : null;
  const date = input
    ? new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(new Date(`${input.dateTokyo}T12:00:00+09:00`))
    : null;
  const weekday = input
    ? new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(`${input.dateTokyo}T12:00:00+09:00`))
    : null;
  const travel = travelFact(input?.travelMode);

  return <main className={styles.page} aria-busy="true">
    <header className={styles.header}><HomeLogo className={styles.homeLogo} /></header>
    <section className={styles.hero}>
      <div className={styles.planDateHeading}><span className={styles.resultDateSticker}><PlanStickerIcon kind="calendar" /></span><div>{date ? <h1>{date}<span className={styles.planWeekday}>{weekday}</span></h1> : <span className={`${styles.skeletonLine} ${styles.skeletonDate}`} />}</div></div>
      <div className={styles.facts}>
        <span><PlanStickerIcon kind="time" /><span><small className="sr-only">時間</small>{input ? <strong>{input.startTime}<em>〜</em>{input.endTime}</strong> : <i className={styles.skeletonLine} />}</span></span>
        <span><PlanStickerIcon kind="budget" /><span><small className="sr-only">ふたりの予算</small>{budgetLabel ? <strong>{budgetLabel}</strong> : <i className={styles.skeletonLine} />}</span></span>
        <span><PlanStickerIcon kind="spots" /><span><small className="sr-only">立ち寄り先</small><i className={`${styles.skeletonLine} ${styles.skeletonCount}`} /></span></span>
        <span><PlanStickerIcon kind={travel.icon} /><span><small className="sr-only">移動手段</small>{input ? <strong>{travel.label}</strong> : <i className={styles.skeletonLine} />}</span></span>
      </div>
    </section>
    <section className={`${styles.itinerary} ${styles.itinerarySkeleton}`} aria-label="プランを作成中">
      <svg className={styles.itineraryRoutePath} viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 0C35 10 4 23 20 36S35 59 18 72S6 91 20 100" /></svg>
      <div className={`${styles.meeting} ${styles.planningMeeting}`}><span className={styles.endpointSticker}><PlanStickerIcon kind="start" /></span><div><small>{input?.startTime ?? "--:--"} 集合</small>{input ? <strong>{input.meet.name}</strong> : <span className={styles.skeletonLine} />}</div><PlanningAgentTicker /></div>
      <ol>{[0, 1, 2].map((index) => <li key={index}>
        <div className={styles.timelineTime}><i className={styles.skeletonTime} /><span className={styles.skeletonTimelineDot} /></div>
        <div className={styles.stop}>
          <article className={`${styles.spot} ${styles.skeletonSpot}`}>
            <div className={`${styles.spotImage} ${styles.skeletonPhoto}`} />
            <div className={`${styles.spotBody} ${styles.skeletonSpotBody}`}>
              <div className={styles.spotTop}><span className={styles.skeletonCategory} /><span className={styles.skeletonMeta} /></div>
              <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
              <div className={styles.skeletonDescription}><span className={styles.skeletonLine} /><span className={styles.skeletonLine} /></div>
              <div className={styles.spotFoot}><span className={styles.skeletonPrice} /></div>
              <div className={`${styles.changeSpot} ${styles.skeletonAction}`}><span className={styles.skeletonLine} /></div>
            </div>
          </article>
        </div>
      </li>)}</ol>
      <div className={styles.meeting}><span className={styles.endpointSticker}><PlanStickerIcon kind="goal" /></span><div><small>{input?.endTime ?? "--:--"}ごろ 解散</small>{input ? <strong>{input.end.name}</strong> : <span className={styles.skeletonLine} />}</div></div>
    </section>
  </main>;
}

export function SessionScreen({ sessionId }: { sessionId: string }) {
  const { data, error, reload, startReplan } = useSession(sessionId);
  const [sheet, setSheet] = useState<"feedback" | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string; locked: boolean } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [replanningItemId, setReplanningItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const latest = data?.runs.at(-1);
  const failed = latest && ["FAILED", "CANCELLED", "INTERRUPTED"].includes(latest.status);
  const active = data?.runs.some((run) => ["PENDING", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL"].includes(run.status));
  const approval = data?.approvals.find((item) => item.status === "PENDING" && item.kind === "PLAN_APPLY");
  const proposalReady = Boolean(approval && data?.proposedPlan && hasVisibleProposal(approval));
  const attention = latest?.status === "WAITING_INPUT" || proposalReady || Boolean(approval && latest?.status === "WAITING_APPROVAL");
  const displayPlan = proposalReady && data?.proposedPlan ? data.proposedPlan : data?.plan ?? null;
  const { photos: placePhotos, loading: photosLoading } = usePlacePhotos((displayPlan?.items ?? []).map((item) => item.spotId));
  if (!data && error) return <main className={styles.page}><HomeLogo className={styles.homeLogo} /><h1>読み込めませんでした</h1><p role="alert">{error}</p><Button variant="secondary" size="compact" onClick={() => void reload().catch(() => undefined)}>もう一度読み込む</Button></main>;
  if (!data || (!data.plan && !failed && !attention)) return <SessionPlanningSkeleton data={data} />;
  const travelUnverified = Boolean(
    displayPlan?.validation.issues.some((issue) =>
      issue.code === "TRAVEL_UNKNOWN" || issue.code === "END_TRAVEL_UNKNOWN",
    ),
  );
  const input = data.session.input;
  const travel = travelFact(input.travelMode);
  const confirmed = ["CONFIRMED", "IN_PROGRESS", "DONE", "REFLECTED"].includes(data.session.status);
  const budget = [input.budget.mealsJpy, input.budget.facilitiesJpy, input.budget.transitJpy];
  const budgetLabel = budget.every((value) => value !== null) ? `¥${budget.reduce<number>((sum, value) => sum + (value ?? 0), 0).toLocaleString()}` : "未設定あり";
  function travelModeLabel(mode: string, walkWithin?: number | null) {
    if (mode === "WALK") return "徒歩";
    if (mode === "TRANSIT") {
      if (walkWithin == null) return "公共交通（徒歩内訳未取得）";
      if (walkWithin === 0) return "公共交通";
      return `公共交通（徒歩${walkWithin}分）`;
    }
    if (mode === "DRIVE") return "車";
    return mode;
  }
  function legForTransition(fromSpotId: string | null, toSpotId: string | null) {
    return displayPlan?.legs.find((leg) => leg.fromSpotId === fromSpotId && leg.toSpotId === toSpotId) ?? null;
  }
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
    <Toast message={message} onDismiss={() => setMessage("")} />
    <header className={styles.header}><HomeLogo className={styles.homeLogo} />{!fixturesEnabled() && <span className={styles.planStatus}>{confirmed ? "予定に追加済み" : proposalReady ? "変更案を確認中" : active && !attention ? "変更案を作成中" : "プランを相談中"}</span>}</header>
    <section className={styles.hero}>
      <div className={styles.planDateHeading}>
        <span className={styles.resultDateSticker}><PlanStickerIcon kind="calendar" /></span><div><h1><time dateTime={input.dateTokyo}>
          {new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", timeZone: "Asia/Tokyo" }).format(new Date(`${input.dateTokyo}T12:00:00+09:00`))}
          <span className={styles.planWeekday}>{new Intl.DateTimeFormat("ja-JP", { weekday: "short", timeZone: "Asia/Tokyo" }).format(new Date(`${input.dateTokyo}T12:00:00+09:00`))}</span>
        </time></h1></div>
      </div>
      <div className={styles.facts}>
        <span><PlanStickerIcon kind="time" /><span><small className="sr-only">時間</small><strong>{input.startTime}<em>〜</em>{input.endTime}</strong></span></span>
        <span><PlanStickerIcon kind="budget" /><span><small className="sr-only">ふたりの予算</small><strong>{budgetLabel}</strong></span></span>
        <span><PlanStickerIcon kind="spots" /><span><small className="sr-only">立ち寄り先</small><strong>{displayPlan?.items.length ?? 0}<em>か所</em></strong></span></span>
        <span><PlanStickerIcon kind={travel.icon} /><span><small className="sr-only">移動手段</small><strong>{travel.label}</strong></span></span>
      </div>
    </section>
    {(error || actionError) && !sheet && <p className={styles.notice} role="alert">{actionError || error}</p>}
    {active && !attention && <p className={styles.workingMessage} role="status">変更案を考えています。このまま少しお待ちください。</p>}
    {failed && <div className={styles.notice} role="alert"><strong>プランを作り直せませんでした</strong><p>{latest?.error || "時間をおいて、もう一度お試しください。"}</p><Button variant="secondary" size="compact" disabled={pending || active} onClick={() => void act(`/api/sessions/${sessionId}/runs`, { kind: data.plan ? "REPLAN" : "INITIAL_PLAN", trigger: latest?.trigger, instruction: latest?.instruction ?? undefined, targetPlanItemId: latest?.targetPlanItemId ?? undefined, basePlanVersion: data.session.currentPlanVersion ?? undefined }, "再度プランを考えています")}>もう一度試す</Button></div>}
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
    {data.grounding?.searchEntryPointHtml && <iframe title="検索情報の出典" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={data.grounding.searchEntryPointHtml} className={styles.searchSources} />}
    {latest?.status === "WAITING_INPUT" && latest.waitingQuestion && <section className={styles.approval}><strong>{latest.waitingQuestion.prompt}</strong><div className={styles.buttonRow}>{latest.waitingQuestion.options.map((answer) => <Button variant="secondary" size="compact" key={answer} disabled={pending} onClick={() => void act(`/api/runs/${latest.id}/answers`, { questionId: latest.waitingQuestion!.id, answer }, "回答を送りました")}>{answer}</Button>)}</div></section>}
    {travelUnverified && <section className={styles.notice} role="status"><strong>移動を確認できていない暫定案</strong><p>店舗候補はありますが、必須区間の経路が取れていません。このままでは確定できません。再試行・近場で再検索・集合/解散の変更から進めてください。</p></section>}
    {!!displayPlan?.validation.issues.length && <section className={styles.notice}><strong>お出かけ前に確認</strong>{displayPlan.validation.issues.map((issue, index) => <p key={index}>{issue.message}</p>)}</section>}
    <section className={styles.itinerary} aria-label="この日のスケジュール"><h2 className="sr-only">この日のスケジュール</h2>
      <svg className={styles.itineraryRoutePath} viewBox="0 0 40 100" preserveAspectRatio="none" aria-hidden="true"><path d="M18 0C35 10 4 23 20 36S35 59 18 72S6 91 20 100" /></svg>
      <div className={styles.meeting}><span className={styles.endpointSticker}><PlanStickerIcon kind="start" /></span><div><small>{input.startTime} 集合</small><strong>{input.meet.name}</strong></div></div>
      <ol>{displayPlan?.items.map((item, index) => {
        const spot = data.spots[item.spotId];
        const visual = spotVisual(spot?.name ?? "", spot?.categories ?? []);
        const duration = Math.max(0, Math.round((Date.parse(item.endAt) - Date.parse(item.startAt)) / 60000));
        const next = displayPlan?.items[index + 1];
        const gap = next ? Math.round((Date.parse(next.startAt) - Date.parse(item.endAt)) / 60000) : 0;
        const prevSpotId = index === 0 ? (input.meet.spotId ?? null) : displayPlan?.items[index - 1]?.spotId ?? null;
        const inbound = index === 0
          ? displayPlan?.legs.find((leg) => leg.from === "MEET" && leg.toSpotId === item.spotId)
          : legForTransition(prevSpotId, item.spotId);
        return <li key={item.id}>
          <div className={styles.timelineTime}><time dateTime={item.startAt}>{formatTokyoHm(item.startAt)}</time><span data-kind={visual.id}><visual.Icon size={19} /></span></div>
          <div className={styles.stop}>
            {inbound && <p className={styles.transition}><span />{inbound.durationMinutes.value != null ? `${inbound.durationMinutes.value}分` : "未検証"} · {travelModeLabel(inbound.mode, inbound.walkMinutesWithin?.value)}</p>}
            {replanningItemId === item.id ? <article className={styles.replanningSpot} aria-label={`${spot?.name ?? "この場所"}の変更案を考えています`}><PlanLoading demo={fixturesEnabled()} compact /></article> : <article className={styles.spot}>
              <SpotCardImage key={item.spotId} spotId={item.spotId} name={spot?.name ?? ""} visual={visual} photo={placePhotos[item.spotId]} loading={photosLoading} />
              <div className={styles.spotBody}>
                <div className={styles.spotTop}><span className={styles.category}>{visual.label}</span><small><Clock3 size={12} />{duration}分</small>{item.locked && <small>時間固定</small>}{item.progress === "DONE" && <small><Check size={12} />訪問済み</small>}</div>
                <h3>{spot?.name ?? "立ち寄りスポット"}</h3>
                <p>{item.reason}</p>
                <div className={styles.spotFoot}><span>{spot?.costForTwoJpy.value ? (spot.costForTwoJpy.value.max === 0 ? "無料" : `¥${spot.costForTwoJpy.value.max.toLocaleString()}まで / ふたり`) : "料金は要確認"}</span>{spot?.officialUrl && <a href={spot.officialUrl} target="_blank" rel="noreferrer">公式サイト <ExternalLink size={12} /></a>}</div>
                {!["DONE", "REFLECTED"].includes(data.session.status) && <button className={styles.changeSpot} disabled={Boolean(active) || pending} onClick={() => openFeedback({ id: item.id, name: spot?.name ?? "このスポット", locked: item.locked })}><MessageCircle size={14} />ここを変えたい<ArrowUpRight size={13} /></button>}
              </div>
            </article>}
            {gap > 0 && <p className={styles.transition}><span />次の予定まで {gap}分<small>移動・ひと休み</small></p>}
          </div>
        </li>;
      })}</ol>
      {!displayPlan?.items.length && <p className={styles.notice}>表示できる行程がまだありません。</p>}
      {(() => {
        const last = displayPlan?.items.at(-1);
        const endLeg = last
          ? displayPlan?.legs.find((leg) => leg.fromSpotId === last.spotId && leg.to === "END")
          : null;
        return endLeg ? <p className={styles.transition}><span />解散まで {endLeg.durationMinutes.value != null ? `${endLeg.durationMinutes.value}分` : "未検証"} · {travelModeLabel(endLeg.mode, endLeg.walkMinutesWithin?.value)}</p> : null;
      })()}
      <div className={styles.meeting}><span className={styles.endpointSticker}><PlanStickerIcon kind="goal" /></span><div><small>{input.endTime}ごろ 解散</small><strong>{input.end.name}</strong></div></div>
    </section>
    {!["DONE", "REFLECTED"].includes(data.session.status) && <button className={styles.wholeFeedback} disabled={Boolean(active) || pending} onClick={() => openFeedback()}><MoodSticker mood="relaxed" /><span><strong>もう少し、こんな一日にしたい</strong><small>プラン全体の希望を伝える</small></span><ArrowUpRight size={16} /></button>}
    <footer className={styles.footer} inert={sheet ? true : undefined}>{confirmed ? <ButtonLink variant="secondary" fullWidth href="/"><Check size={17} />カレンダーで予定を見る</ButtonLink> : <Button fullWidth disabled={saving || pending || Boolean(active) || !data.plan?.items.length || data.plan.validation.state === "FAIL" || travelUnverified || Boolean(attention)} onClick={async () => { setSaving(true); try { await act(`/api/sessions/${sessionId}/progress`, { confirm: true, status: "CONFIRMED" }, "カレンダーに予定を追加しました"); } finally { setSaving(false); } }}>{saving ? "保存しています…" : travelUnverified ? "移動確認後に確定できます" : "このプランで決める"}<Check size={17} /></Button>}</footer>
    {sheet === "feedback" && <HomeSheet title={target ? "ここ、少し変えよう" : "プランの希望を伝える"} onClose={() => setSheet(null)}>
      <form className={styles.feedbackForm} onSubmit={async (event) => {
        event.preventDefault();
        if (!feedback.trim() || pending || active) return;
        const version = data.session.currentPlanVersion;
        if (version == null) { setActionError("今見ているプランを読み込めませんでした。画面を更新してからもう一度。"); return; }
        setSheet(null); setPending(true); setActionError(""); setMessage(""); setReplanningItemId(target?.id ?? null);
        const startedAt = Date.now();
        try {
          await startReplan({ instruction: feedback.trim(), targetPlanItemId: target?.id, basePlanVersion: version });
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1800 - (Date.now() - startedAt))));
          setMessage(target ? "この場所をもう一度考えています。" : "希望を送りました。変更案を考えています。");
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
        } finally {
          setPending(false); setReplanningItemId(null);
        }
      }}>
        <div className={styles.feedbackIntro}><MoodSticker mood="relaxed" /><div className={styles.feedbackSpeech}><small>{target?.name ?? "一日の過ごし方"}</small><strong>どんなふうに変えたい？</strong></div></div>
        {target?.locked && <p className={styles.fieldHint}>時間が決まっている予定です。固定条件を守れる範囲で調整します。</p>}
        <fieldset className={styles.feedbackQuick}><legend>近い希望があれば選んでね</legend><div className={styles.quickOptions}>{["別の場所がいい", "予算を抑えたい", "ゆっくり過ごしたい", "移動を少なくしたい"].map((text) => {
          const selected = feedback.split("\n").includes(text);
          return <button type="button" key={text} aria-pressed={selected} disabled={pending} onClick={() => setFeedback((value) => {
            const lines = value.split("\n").filter(Boolean);
            return selected ? lines.filter((line) => line !== text).join("\n") : [...lines, text].join("\n");
          })}><span aria-hidden="true">{selected && <Check size={12} />}</span>{text}</button>;
        })}</div></fieldset>
        <label className={styles.feedbackLabel}><span><strong>追加の希望</strong><small>自由に入力 · 任意</small></span><TextArea rows={3} maxLength={1000} value={feedback} disabled={pending} onChange={(event) => setFeedback(event.target.value)} placeholder="別の美術館がいい、もう少しカフェでゆっくりしたい" /></label>
        {fixturesEnabled() && <p className={styles.fieldHint}>現在は操作確認用のサンプルです。</p>}
        {actionError && <p className={styles.notice} role="alert">{actionError}</p>}
        <Button fullWidth type="submit" className={styles.feedbackSubmit} disabled={!feedback.trim() || pending || Boolean(active)}>{pending ? "送っています…" : "この希望で考え直す"}<ArrowUpRight size={17} /></Button>
      </form>
    </HomeSheet>}
  </main>;
}
