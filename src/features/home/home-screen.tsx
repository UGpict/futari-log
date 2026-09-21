"use client";

import { TextInput, TextArea } from "@/components/text-input";

import { Button, IconButton } from "@/components/button";

import { useEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ChevronLeft, ChevronRight, NotebookPen, CalendarHeart, LogOut, MapPin } from "lucide-react";
import { useCalendarPlans } from "@/client/hooks/use-calendar-plans";
import { api } from "@/client/api";
import { forgetAuthEntry } from "@/client/auth-entry";
import { useMe } from "@/client/hooks/use-me";
import { useDateJournal, type DateMemory } from "@/client/hooks/use-date-journal";
import { RiveMascot } from "@/components/rive-mascot";
import { DateCreateButton } from "@/components/date-create-button";
import { Toast } from "@/components/toast";
import { DevelopmentLink } from "@/components/development-link";
import { HomeLogo } from "@/components/home-logo";
import { MoodSticker, moods, type Mood } from "@/components/mood-sticker";
import { PlanStickerIcon } from "@/components/plan-sticker-icon";
import { HomeSheet } from "./home-sheet";
import { MemoryScreen } from "@/features/memory/memory-screen";
import { HOME_SUGGESTION } from "./home-suggestion";
import { nearbySampleEvents } from "./sample-events";
import { decideReflectionSave, reflectionSaveNotice } from "./reflection-save";
import { buildDemoCalendarRecords, type DemoCalendarConfig } from "./demo-calendar-stickers";
import styles from "./home.module.css";

type Panel = "records" | "recommendations" | "memory" | null;
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const ideas = [
  { mood: "happy" as const, title: "甘いものと、ゆっくり話す日", description: "カフェでひと息。ふたりのペースで。", wish: "カフェで甘いものを食べて、ゆっくり話したい" },
  { mood: "happy" as const, title: "いつもと違う道を、ふたりで", description: "公園さんぽと、小さな寄り道。", wish: "公園を散歩して、途中でカフェに寄りたい" },
  { mood: "relaxed" as const, title: "雨の日は、アートに会いに", description: "屋内で楽しむ、のんびりデート。", wish: "美術館や屋内の展示を、休憩を挟みながら楽しみたい" },
];

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short", timeZone: "Asia/Tokyo" })
    .format(new Date(`${date}T12:00:00+09:00`));
}

function FeedbackEditor({ date, record, onSave }: {
  date: string; record?: DateMemory; onSave: (value: DateMemory) => Promise<void>;
}) {
  const [mood, setMood] = useState<Mood | null>(record?.mood ?? null);
  const [title, setTitle] = useState(record?.title ?? "");
  const [note, setNote] = useState(record?.note ?? "");
  const [error, setError] = useState("");

  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mood || saving) return;
    setSaving(true); setError("");
    try {
      await onSave({ date, mood, title: title.trim() || "ふたりで過ごした日", note: note.trim() });
    } catch {
      setError("記録を保存できませんでした。ブラウザの保存設定を確認して、もう一度お試しください。");
    } finally { setSaving(false); }
  }

  return (
    <form className={styles.feedbackForm} onSubmit={submit}>
      <div className={styles.feedbackIntro}>
        <span className={styles.eyebrow}>{dateLabel(date)}</span>
      </div>
      <section className={styles.reflectionEditorCard}>
        <div className={styles.reflectionCardHeading}><strong>相手はどんな様子だった？</strong></div>
        <fieldset className={styles.moodPicker}>
          <legend className="sr-only">相手の様子</legend>
          {moods.map((item) => (
            <label key={item.id} className={`${styles.moodOption} ${mood === item.id ? styles.moodSelected : ""}`}>
              <input className="sr-only" type="radio" name="mood" value={item.id} checked={mood === item.id} onChange={() => setMood(item.id)} required />
              <MoodSticker mood={item.id} />
              <span>{item.label}</span>
              {mood === item.id && <span className={styles.moodCheck} aria-hidden="true"><Check size={14} /></span>}
            </label>
          ))}
        </fieldset>
      </section>
      <div className={styles.reflectionFields}>
        <label className={styles.formLabel}>この日のタイトル <span>任意</span>
          <TextInput value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="カフェで過ごした、のんびりな午後" />
        </label>
        <label className={styles.formLabel}>この日のこと <span>任意</span>
          <TextArea value={note} maxLength={500} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="楽しかった場面や、相手の様子を残しておこう" />
        </label>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button fullWidth className={styles.primaryButton} type="submit" disabled={!mood || saving}><Check size={20} />{saving ? "保存しています…" : record ? "振り返りを更新" : "振り返りを保存"}</Button>
    </form>
  );
}

export function HomeScreen({ demoCalendar }: { demoCalendar?: DemoCalendarConfig } = {}) {
  const router = useRouter();
  const { me } = useMe();
  const { plans, error: plansError } = useCalendarPlans(me?.coupleId);
  const [reflecting, setReflecting] = useState(false);
  const resolvedDemo = useMemo<DemoCalendarConfig>(() => {
    if (demoCalendar) return demoCalendar;
    return {
      enabled: Boolean(me?.demoCalendarStickers),
      anchorDate:
        me?.demoCalendarAnchorDate && /^\d{4}-\d{2}-\d{2}$/.test(me.demoCalendarAnchorDate)
          ? me.demoCalendarAnchorDate
          : "2026-09-21",
    };
  }, [demoCalendar, me]);
  const demoRecords = useMemo(
    () => (resolvedDemo.enabled ? buildDemoCalendarRecords(resolvedDemo.anchorDate) : []),
    [resolvedDemo.enabled, resolvedDemo.anchorDate],
  );
  const { records, save, saveToServer, remove, today, isFixture, demoStickersActive } = useDateJournal(
    me?.uid,
    demoRecords,
  );
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const demoMonth = resolvedDemo.enabled ? resolvedDemo.anchorDate.slice(0, 7) : null;
  const currentMonth = isFixture ? "2026-09" : demoMonth ?? today.slice(0, 7);
  const monthKey = monthOverride ?? currentMonth;
  const [year, month] = (monthKey || "2026-09").split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [stampedDate, setStampedDate] = useState<string | null>(null);
  const recordsByDate = new Map(records.map((record) => [record.date, record]));
  const panelTitles: Record<Exclude<Panel, null>, string> = {
    records: "ふたりの記録", recommendations: "AIからの提案", memory: "次のデートに活かすこと",
  };


  function changeMonth(delta: number) {
    setSelectedDate(null);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    setMonthOverride(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  function openPlan(date = today, opts?: { seed?: string; wish?: string }) {
    setSelectedDate(null);
    const query = new URLSearchParams({ date, step: "activity" });
    if (opts?.seed) query.set("seed", opts.seed);
    if (opts?.wish) query.set("wish", opts.wish);
    router.push(`/plans/new?${query.toString()}`);
  }

  async function saveMemory(record: DateMemory) {
    const dayPlans = plans.filter((plan) => plan.date === record.date);
    const reflectable = dayPlans.filter((plan) =>
      ["DONE", "REFLECTED", "CONFIRMED", "IN_PROGRESS"].includes(plan.status),
    );
    const decision = decideReflectionSave({
      isFixture,
      reflectableSessionIds: reflectable.map((plan) => plan.id),
    });
    if (decision.dest === "server") {
      try {
        await saveToServer(decision.sessionId, record);
        setNotice(reflectionSaveNotice(decision));
      } catch {
        save(record);
        setNotice(reflectionSaveNotice(decision, { offline: true }));
      }
    } else {
      save(record);
      setNotice(reflectionSaveNotice(decision));
    }
    setReflecting(false);
    setStampedDate(record.date);
    setSelectedDate(null);
  }

  const selectedPlans = plans.filter((plan) => plan.date === selectedDate);
  const selectedRecord = selectedDate ? recordsByDate.get(selectedDate) : undefined;
  const showCreatePrompt = Boolean(selectedDate && today && selectedDate >= today && !selectedRecord && selectedPlans.length === 0);
  const createPromptRef = useRef<HTMLDivElement>(null);
  const createTriggerRef = useRef<HTMLButtonElement>(null);
  const eventSectionRef = useRef<HTMLElement>(null);
  const eventCarouselRef = useRef<HTMLDivElement>(null);
  const eventDragRef = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 });
  const [eventsBehindCreateButton, setEventsBehindCreateButton] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [eventScroll, setEventScroll] = useState({ left: false, right: true });
  const [draggingEvents, setDraggingEvents] = useState(false);
  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // The local entry still needs to be cleared if the session already expired.
    }
    forgetAuthEntry();
    router.replace("/auth");
  }
  useEffect(() => {
    const section = eventSectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setEventsBehindCreateButton(entry.isIntersecting), { threshold: 0 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [isFixture]);
  function updateEventScroll() {
    const carousel = eventCarouselRef.current;
    if (!carousel) return;
    setEventScroll({ left: carousel.scrollLeft > 2, right: carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 2 });
  }
  function scrollEvents(direction: -1 | 1) {
    const carousel = eventCarouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({ left: direction * Math.max(240, carousel.clientWidth * .78), behavior: "smooth" });
  }
  function startEventDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    eventDragRef.current = { active: true, moved: false, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
  }
  function moveEventDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = eventDragRef.current;
    if (!drag.active) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) > 6) {
      drag.moved = true;
      setDraggingEvents(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  }
  function endEventDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!eventDragRef.current.active) return;
    eventDragRef.current.active = false;
    setDraggingEvents(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  useEffect(() => {
    if (!showCreatePrompt) return;
    function dismissOutside(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (createPromptRef.current?.contains(target) || createTriggerRef.current?.contains(target)) return;
      setSelectedDate(null);
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [showCreatePrompt]);
  const selectedCell = selectedDate ? firstWeekday + Number(selectedDate.slice(-2)) - 1 : 0;
  const promptPosition = {
    "--day-column": selectedCell % 7,
    "--day-row": Math.floor(selectedCell / 7),
    "--week-count": cellCount / 7,
  } as CSSProperties;
  function openDay(date: string) {
    if (!today) return;
    const hasRecord = recordsByDate.has(date);
    const hasPlan = plans.some((plan) => plan.date === date);
    if (date < today && !hasRecord && !hasPlan) return;
    setReflecting(date <= today && hasPlan && !hasRecord);
    setSelectedDate(!hasRecord && !hasPlan && date === selectedDate ? null : date);
  }
  return (
    <div className={styles.page}>
      <main className={styles.mobileApp}>
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <div className={styles.brand}>
              <h1><HomeLogo className={styles.logo} /></h1>
            </div>
            <div className={styles.headerActions}>
              <DevelopmentLink onResetToday={() => { remove(today); setSelectedDate(null); setReflecting(false); setNotice("今日の記録を削除しました"); }} />
              <IconButton type="button" label="ふたりの記憶を開く" onClick={() => setPanel("memory")}><NotebookPen size={23} /></IconButton>
              <span className={styles.logoutControl}>
                <IconButton type="button" label="ログアウト" aria-expanded={logoutOpen} onClick={() => setLogoutOpen((open) => !open)}><LogOut size={21} /></IconButton>
                {logoutOpen && <span className={styles.logoutPopover} role="dialog" aria-label="ログアウトの確認">
                  <strong>ログアウトしますか？</strong>
                  <span>保存済みの記録は消えません。</span>
                  <span className={styles.logoutActions}>
                    <Button size="compact" variant="danger" disabled={logoutBusy} onClick={() => void logout()}>{logoutBusy ? "処理中…" : "ログアウト"}</Button>
                    <Button size="compact" variant="ghost" disabled={logoutBusy} onClick={() => setLogoutOpen(false)}>キャンセル</Button>
                  </span>
                </span>}
              </span>
            </div>
          </div>
        </header>

        <section className={styles.agentSuggestion} aria-labelledby="ai-suggestion-title">
          <h2 id="ai-suggestion-title" className={styles.suggestionHeading}>AIからの提案</h2>
          <div className={styles.suggestionConversation}>
            <span className={styles.suggestionMascot}><RiveMascot variant="suggestion" active={!panel && !selectedDate} /></span>
            <div className={styles.suggestionSpeech}>
              <p>アートのあとは、<br />カフェでひと息つかない？</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.suggestionCard}
            onClick={() => openPlan(today, { seed: "home-suggestion" })}
            aria-label={`${HOME_SUGGESTION.area}で、${HOME_SUGGESTION.title}。この案でプランをつくる`}
            aria-haspopup="dialog"
          >
            <span className={styles.suggestionPhoto} aria-hidden="true" />
            <span className={styles.suggestionCopy}>
              <span className={styles.suggestionArea}><MapPin size={12} aria-hidden="true" />{HOME_SUGGESTION.area}</span>
              <strong>{HOME_SUGGESTION.title}</strong>
              <span className={styles.suggestionRoute}>{HOME_SUGGESTION.routeLabels[0]}<ArrowRight size={12} aria-hidden="true" />{HOME_SUGGESTION.routeLabels[1]}</span>
              <span className={styles.suggestionAction}>この案でプランをつくる<ArrowRight size={15} aria-hidden="true" /></span>
            </span>
          </button>
        </section>

        <section className={styles.calendar} onKeyDown={(event) => { if (event.key === "Escape" && showCreatePrompt) setSelectedDate(null); }} aria-label={`${year}年${month}月のデートカレンダー`}>
          <div className={styles.calendarHeader}>
            <IconButton type="button" className={styles.monthButton} label="前の月" onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></IconButton>
            <div className={styles.calendarMonth}>
              <h2 aria-live="polite"><span className={styles.yearLabel}>{year}年</span><span>{month}<small>月</small></span></h2>
              <button type="button" className={styles.returnToCurrentMonth} data-current={monthKey === currentMonth} disabled={monthKey === currentMonth} aria-label="今月にもどる" onClick={() => { setMonthOverride(null); setSelectedDate(null); setNotice("今月のカレンダーに戻りました"); }}>今月</button>
            </div>
            <IconButton type="button" className={styles.monthButton} label="次の月" onClick={() => changeMonth(1)}><ChevronRight size={20} /></IconButton>
          </div>
          <div className={styles.weekdays} aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className={styles.calendarGrid}>
            {Array.from({ length: cellCount }, (_, index) => {
              const day = index - firstWeekday + 1;
              if (day < 1 || day > daysInMonth) return <div key={`empty-${index}`} className={styles.emptyDay} aria-hidden="true" />;
              const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const record = recordsByDate.get(date);
              const dayPlans = plans.filter((plan) => plan.date === date);
              const isToday = date === today;
              const inactive = !today || (date < today && !record && dayPlans.length === 0);
              return (
                <button ref={showCreatePrompt && selectedDate === date ? createTriggerRef : undefined} type="button" key={date} disabled={inactive} onClick={() => openDay(date)}
                  className={`${styles.day} ${record ? styles.dayWithSticker : ""} ${isToday ? styles.today : ""} ${showCreatePrompt && selectedDate === date ? styles.selectedDay : ""}`}
                  aria-current={isToday ? "date" : undefined}
                  aria-expanded={!record && !dayPlans.length && !inactive ? showCreatePrompt && selectedDate === date : undefined}
                  aria-controls={!record && !dayPlans.length && !inactive ? "calendar-create-prompt" : undefined}
                  aria-label={`${year}年${month}月${day}日${record ? `、${record.title}、${moods.find((m) => m.id === record.mood)?.label}` : dayPlans.length ? `、予定${dayPlans.length}件、${date <= today ? "振り返る" : "プランをひらく"}` : inactive ? "、予定・記録なし" : "、この日のプランをつくる"}`}>
                  {!record && <span className={styles.dayNumber}>{day}</span>}
                  {!record && dayPlans.length > 0 && <span className={styles.plannedSticker} aria-hidden="true"><MoodSticker mood="happy" /></span>}
                  {record && <MoodSticker mood={record.mood} className={`${styles.calendarSticker} ${record.mood === "happy" ? styles.heartOffset : ""} ${stampedDate === date ? styles.stampArrival : ""}`} />}
                </button>
              );
            })}
            {showCreatePrompt && selectedDate && <div ref={createPromptRef} key={selectedDate} id="calendar-create-prompt" className={styles.inlineCreate} data-placement={Math.floor(selectedCell / 7) === cellCount / 7 - 1 ? "above" : "below"} style={promptPosition}>
              <button type="button" className={styles.inlineCreateButton} aria-label={`${dateLabel(selectedDate)}のデートをつくる`} onClick={() => openPlan(selectedDate)}>
                この日にデートをつくる
              </button>
            </div>}
          </div>
        </section>

        {plansError && <p className={styles.localNote} role="alert">{plansError}</p>}
        {plans.length > 0 && <p className={styles.calendarLegend}><span><MoodSticker mood="happy" /></span>淡いシールは予定。デートのあとに、気持ちを貼ろう。</p>}
        {demoStickersActive && <p className={styles.demoCalendarNote}>デモ用の記録を含みます</p>}
        <section ref={eventSectionRef} className={styles.nearbyEvents} aria-labelledby="nearby-events-title">
          <header><div><h2 id="nearby-events-title">近くのイベントから探す</h2></div><small><MapPin size={11} aria-hidden="true" />東京周辺</small></header>
          <button type="button" className={`${styles.carouselButton} ${styles.carouselPrevious}`} aria-label="前のイベントを見る" disabled={!eventScroll.left} onClick={() => scrollEvents(-1)}><ChevronLeft aria-hidden="true" /></button>
          <div ref={eventCarouselRef} className={styles.eventCarousel} data-dragging={draggingEvents} aria-label="近隣イベント" tabIndex={0} onScroll={updateEventScroll} onPointerDown={startEventDrag} onPointerMove={moveEventDrag} onPointerUp={endEventDrag} onPointerCancel={endEventDrag} onClickCapture={(event) => {
            if (!eventDragRef.current.moved) return;
            event.preventDefault();
            event.stopPropagation();
            eventDragRef.current.moved = false;
          }} onDragStart={(event) => event.preventDefault()} onWheel={(event) => {
            const carousel = event.currentTarget;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || carousel.scrollWidth <= carousel.clientWidth) return;
            event.preventDefault();
            carousel.scrollLeft += event.deltaY;
          }}>
            {nearbySampleEvents.map((event) => <button type="button" key={event.id} className={styles.eventBanner} data-theme={event.theme} data-demo="true" onClick={() => openPlan(today, { seed: event.id })} aria-label={`サンプル。${event.title}、${event.dateLabel}、${event.area}。この雰囲気でプランをつくる`}>
              <span className={styles.eventArtwork} aria-hidden="true"><span className={styles.eventShade} /></span>
              <span className={styles.eventDetails}>
                <span className={styles.eventMeta}><span className={styles.eventDemoBadge}>サンプル</span><span>{event.dateLabel}</span><span><MapPin size={10} />{event.area}</span>{event.sponsored && <span>PR</span>}</span>
                <span className={styles.eventCopy}><strong>{event.title}</strong><span>{event.kicker}</span></span>
                <span className={styles.eventAction}>この雰囲気でプランをつくる <ArrowRight size={14} /></span>
              </span>
            </button>)}
          </div>
          <button type="button" className={`${styles.carouselButton} ${styles.carouselNext}`} aria-label="次のイベントを見る" disabled={!eventScroll.right} onClick={() => scrollEvents(1)}><ChevronRight aria-hidden="true" /></button>
          <p className={styles.eventDisclosure}>大会用のサンプル表示です。イベント名・開催期間はプランの実データには使いません。行程は実在スポットから作ります。</p>
        </section>
      </main>
      <div className={styles.createDateFab} data-over-events={eventsBehindCreateButton}><DateCreateButton onClick={() => openPlan()} /></div>

      <Toast message={notice} onDismiss={() => { setNotice(""); setStampedDate(null); }} />

      {selectedDate && !showCreatePrompt && (
        <HomeSheet key={selectedDate} title={reflecting ? "今回のデート、どうだった？" : selectedRecord?.demo ? "デモ用サンプル" : recordsByDate.has(selectedDate) ? "あの日の記録" : "ふたりの一日"} onClose={() => setSelectedDate(null)}>
          {selectedRecord && !reflecting ? <div className={styles.recordSummary}>
            <header className={styles.recordHero}><MoodSticker mood={selectedRecord.mood} className={styles.recordSummarySticker} /><span className={styles.eyebrow}>{dateLabel(selectedDate)}</span>{selectedRecord.demo && <span className={styles.demoRecordBadge}>デモ用サンプル</span>}<h3>{selectedRecord.title}</h3></header>
            {selectedRecord.note && <section className={styles.recordReflectionCard}><p className={styles.recordNote}>{selectedRecord.note}</p></section>}
            {selectedPlans.length > 0 && <section className={styles.recordPlanSection}><div className={styles.recordSectionHeading}><span><PlanStickerIcon kind="calendar" /></span><div><small>関連するプラン</small><strong>この日のプラン</strong></div></div>{selectedPlans.map((plan) => <Link key={plan.id} className={styles.planOpenLink} href={`/sessions/${plan.id}`}><span>{plan.title}</span><ChevronRight size={17} /></Link>)}</section>}
            {!selectedPlans.length && !selectedRecord.demo && <p className={styles.localNote}>この記録に紐づくプランはありません。</p>}
            {selectedRecord.demo ? (
              <p className={styles.localNote}>大会デモ用の表示です。実記録としては保存されていません。</p>
            ) : (
              <Button fullWidth type="button" className={styles.recordEditButton} onClick={() => setReflecting(true)}>振り返りを編集<ChevronRight size={17} /></Button>
            )}
          </div> : selectedPlans.length > 0 && !reflecting ? <div className={styles.plannedDay}>
            <span className={styles.eyebrow}>{dateLabel(selectedDate)}</span>
            {selectedPlans.map((plan) => {
              const canReflect = Boolean(today) && selectedDate <= today;
              return <article className={styles.calendarPlanCard} key={plan.id}>
                <div className={styles.calendarPlanTitle}><span className={styles.planCardSticker}><PlanStickerIcon kind="calendar" /></span><div><small>{plan.startTime}〜{plan.endTime}<em>{plan.status === "DRAFT" ? "相談中" : ["DONE", "REFLECTED"].includes(plan.status) ? "おでかけ済み" : "予定"}</em></small><h3>{plan.title}</h3></div></div>
                <Link className={styles.planOpenLink} href={`/sessions/${plan.id}`}>プランを見る<ChevronRight size={17} /></Link>
                {canReflect ? <Button fullWidth className={styles.primaryButton} onClick={() => setReflecting(true)}>{recordsByDate.has(selectedDate) && !selectedRecord?.demo ? "振り返りを見る・編集する" : "この日を振り返る"}<MoodSticker mood="relaxed" /></Button> : <p className={styles.localNote}>{plan.status === "DRAFT" ? "まずはプランを決めよう。振り返りはデートのあとに。" : "デートが終わったら、ここから振り返れます。"}</p>}
              </article>;
            })}
          </div> : (selectedPlans.length > 0 || (selectedRecord && !selectedRecord.demo)) && selectedDate <= today ? <>
            {selectedPlans.map((plan) => <Link key={plan.id} className={styles.reflectionPlanLink} href={`/sessions/${plan.id}`}><CalendarHeart size={15} /><span>{plan.title}</span><ChevronRight size={15} /></Link>)}
            <FeedbackEditor date={selectedDate} record={selectedRecord?.demo ? undefined : recordsByDate.get(selectedDate)} onSave={saveMemory} />
          </> : null}
        </HomeSheet>
      )}

      {panel && <HomeSheet key={panel} fixedHeight={panel === "memory"} title={panelTitles[panel]} onClose={() => setPanel(null)}>
        {panel === "records" && <div className={styles.recordList}>
          <p className={styles.sheetDescription}>シールひとつに、ふたりの思い出。{isFixture && " 今はサンプルの記録を表示しています。"}{demoStickersActive && " デモ用の記録を含みます。"}</p>
          {records.length === 0 && <p className={styles.emptyMessage}>まだ記録がありません。カレンダーの日付をタップして、最初のシールを貼ってみよう。</p>}
          {[...records].sort((a, b) => b.date.localeCompare(a.date)).map((record) => (
            <button type="button" key={record.date} className={styles.recordCard} onClick={() => { setPanel(null); openDay(record.date); }}>
              <MoodSticker mood={record.mood} /><span><small>{dateLabel(record.date)}{record.demo ? " · デモ" : ""}</small><strong>{record.title}</strong><span>{record.note}</span></span><ChevronRight size={18} />
            </button>
          ))}
        </div>}
        {panel === "recommendations" && <div className={styles.recordList}>
          <p className={styles.sheetDescription}>気になる過ごし方から、ふたりのプランをつくろう。</p>
          {ideas.map((idea) => <button type="button" className={styles.ideaCard} key={idea.title} onClick={() => openPlan(today, { wish: idea.wish })}>
            <MoodSticker mood={idea.mood} /><span><strong>{idea.title}</strong><small>{idea.description}</small><span className={styles.ideaLink}>この気分でプランをつくる <ArrowRight size={14} /></span></span>
          </button>)}
        </div>}
        {panel === "memory" && <MemoryScreen key={me?.coupleId ?? "guest"} coupleId={me?.coupleId ?? null} embedded />}

      </HomeSheet>}
    </div>
  );
}
