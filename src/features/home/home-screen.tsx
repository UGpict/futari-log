"use client";

import { Button, IconButton } from "@/components/button";

import { useEffect, useRef, useState, type FormEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronLeft, ChevronRight, NotebookPen, CalendarHeart, MapPin } from "lucide-react";
import { useCalendarPlans } from "@/client/hooks/use-calendar-plans";
import { useMe } from "@/client/hooks/use-me";
import { useDateJournal, type DateMemory } from "@/client/hooks/use-date-journal";
import { RiveMascot } from "@/components/rive-mascot";
import { DateCreateButton } from "@/components/date-create-button";
import { Toast } from "@/components/toast";
import { DevelopmentLink } from "@/components/development-link";
import { HomeLogo } from "@/components/home-logo";
import { MoodSticker, moods, type Mood } from "@/components/mood-sticker";
import { HomeSheet } from "./home-sheet";
import { MemoryScreen } from "@/features/memory/memory-screen";
import { PlanForm } from "./plan-form";
import { HOME_SUGGESTION, type PlanFormSeed } from "./home-suggestion";
import { nearbySampleEvents } from "./sample-events";
import styles from "./home.module.css";

type Panel = "records" | "recommendations" | "memory" | "plan" | null;
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
        <h3>相手はどんな様子だった？</h3>
        <p>印象に近いスタンプを選んで、振り返りを完了しよう。</p>
      </div>
      <fieldset className={styles.moodPicker}>
        <legend className="sr-only">相手の様子</legend>
        {moods.map((item) => (
          <label key={item.id} className={`${styles.moodOption} ${mood === item.id ? styles.moodSelected : ""}`}>
            <input className="sr-only" type="radio" name="mood" value={item.id} checked={mood === item.id} onChange={() => setMood(item.id)} required />
            <MoodSticker mood={item.id} />
            <span>{item.label}</span>
            {mood === item.id && <Check className={styles.moodCheck} size={14} />}
          </label>
        ))}
      </fieldset>
      <label className={styles.formLabel}>この日のタイトル <span>任意</span>
        <input value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} placeholder="カフェで過ごした、のんびりな午後" />
      </label>
      <label className={styles.formLabel}>どんな場面で、そう感じた？ <span>任意</span>
        <textarea value={note} maxLength={500} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="カフェで「また来たい」と言っていた。散歩の途中は少し疲れていそうだった。" />
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button fullWidth className={styles.primaryButton} type="submit" disabled={!mood || saving}><Check size={20} />{saving ? "保存しています…" : record ? "スタンプと記録を更新する" : "振り返りを完了してスタンプを押す"}</Button>
      <p className={styles.localNote}>この端末のブラウザに保存されます。</p>
    </form>
  );
}

export function HomeScreen() {
  const { me } = useMe();
  const { plans, error: plansError } = useCalendarPlans(me?.coupleId);
  const [reflecting, setReflecting] = useState(false);
  const { records, save, saveToServer, remove, today, isFixture } = useDateJournal(me?.uid);
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const currentMonth = isFixture ? "2026-09" : today.slice(0, 7);
  const monthKey = monthOverride ?? currentMonth;
  const [year, month] = (monthKey || "2026-09").split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [planDate, setPlanDate] = useState("");
  const [planSeed, setPlanSeed] = useState<PlanFormSeed | undefined>(undefined);
  const [planStep, setPlanStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [stampedDate, setStampedDate] = useState<string | null>(null);
  const recordsByDate = new Map(records.map((record) => [record.date, record]));
  const panelTitles: Record<Exclude<Panel, null>, string> = {
    records: "ふたりの記録", recommendations: "AIからの提案", memory: "次のデートに活かすこと", plan: ["過ごし方を選ぶ", "日時と場所を決める", "予算と希望を決める"][planStep],
  };


  function changeMonth(delta: number) {
    setSelectedDate(null);
    const date = new Date(Date.UTC(year, month - 1 + delta, 1));
    setMonthOverride(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  function openPlan(date = today, seed?: PlanFormSeed) {
    setSelectedDate(null);
    setPlanDate(date);
    setPlanSeed(seed);
    setPlanStep(0);
    setPanel("plan");
  }

  async function saveMemory(record: DateMemory) {
    const dayPlans = plans.filter((plan) => plan.date === record.date);
    const reflectable = dayPlans.filter((plan) =>
      ["DONE", "REFLECTED", "CONFIRMED", "IN_PROGRESS"].includes(plan.status),
    );
    // 同日複数は勝手に紐付けない。1件だけならそのセッションへ保存。0件ならローカルのみ。
    if (!isFixture && reflectable.length === 1) {
      try {
        await saveToServer(reflectable[0].id, record);
        setNotice("振り返りを保存しました。分析は裏で続きます。");
      } catch {
        save(record);
        setNotice("オフライン保存しました。再接続後にサーバーへ送れます。");
      }
    } else {
      save(record);
      setNotice(
        reflectable.length > 1
          ? "同日に複数の予定があるため、端末にのみ保存しました（セッション紐付けは未選択）。"
          : "振り返り完了！スタンプを押しました",
      );
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
  const [eventScroll, setEventScroll] = useState({ left: false, right: true });
  const [draggingEvents, setDraggingEvents] = useState(false);
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
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveEventDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = eventDragRef.current;
    if (!drag.active) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 4) {
      drag.moved = true;
      setDraggingEvents(true);
    }
    if (drag.moved) event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  }
  function endEventDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!eventDragRef.current.active) return;
    eventDragRef.current.active = false;
    setDraggingEvents(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (eventDragRef.current.moved) window.setTimeout(() => { eventDragRef.current.moved = false; }, 0);
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
            onClick={() =>
              openPlan(today, {
                wish: HOME_SUGGESTION.wish,
                meet: HOME_SUGGESTION.meetPlace,
                startTime: HOME_SUGGESTION.startTime,
                endTime: HOME_SUGGESTION.endTime,
              })
            }
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
        <section ref={eventSectionRef} className={styles.nearbyEvents} aria-labelledby="nearby-events-title">
          <header><div><h2 id="nearby-events-title">近くのイベントから探す</h2></div><small><MapPin size={11} aria-hidden="true" />東京周辺</small></header>
          <button type="button" className={`${styles.carouselButton} ${styles.carouselPrevious}`} aria-label="前のイベントを見る" disabled={!eventScroll.left} onClick={() => scrollEvents(-1)}><ChevronLeft aria-hidden="true" /></button>
          <div ref={eventCarouselRef} className={styles.eventCarousel} data-dragging={draggingEvents} aria-label="近隣イベント" tabIndex={0} onScroll={updateEventScroll} onPointerDown={startEventDrag} onPointerMove={moveEventDrag} onPointerUp={endEventDrag} onPointerCancel={endEventDrag} onClickCapture={(event) => {
            if (!eventDragRef.current.moved) return;
            event.preventDefault();
            event.stopPropagation();
            eventDragRef.current.moved = false;
          }} onWheel={(event) => {
            const carousel = event.currentTarget;
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || carousel.scrollWidth <= carousel.clientWidth) return;
            event.preventDefault();
            carousel.scrollLeft += event.deltaY;
          }}>
            {nearbySampleEvents.map((event) => <button type="button" key={event.id} className={styles.eventBanner} data-theme={event.theme} data-demo="true" onClick={() => openPlan(today, { wish: event.planWish, meet: event.meet })} aria-label={`サンプル。${event.title}、${event.dateLabel}、${event.area}。この雰囲気でプランをつくる`}>
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
        <HomeSheet key={selectedDate} title={reflecting ? "今回のデート、どうだった？" : recordsByDate.has(selectedDate) ? "あの日の記録" : "ふたりの一日"} onClose={() => setSelectedDate(null)}>
          {selectedRecord && !reflecting ? <div className={styles.recordSummary}>
            <span className={styles.eyebrow}>{dateLabel(selectedDate)}</span>
            <MoodSticker mood={selectedRecord.mood} className={styles.recordSummarySticker} />
            <span className={styles.recordMoodLabel}>{moods.find((mood) => mood.id === selectedRecord.mood)?.label}</span>
            <h3>{selectedRecord.title}</h3>
            {selectedRecord.note && <p className={styles.recordNote}>{selectedRecord.note}</p>}
            {selectedPlans.map((plan) => <Link key={plan.id} className={styles.planOpenLink} href={`/sessions/${plan.id}`}><span>この日のプランを見る<br /><small>{plan.title}</small></span><ChevronRight size={17} /></Link>)}
            {!selectedPlans.length && <p className={styles.localNote}>この記録に紐づくプランはありません。</p>}
            <Button fullWidth type="button" className={styles.primaryButton} onClick={() => setReflecting(true)}>振り返りを編集する<ChevronRight size={17} /></Button>
          </div> : selectedPlans.length > 0 && !reflecting ? <div className={styles.plannedDay}>
            <span className={styles.eyebrow}>{dateLabel(selectedDate)}</span>
            {selectedPlans.map((plan) => {
              const canReflect = Boolean(today) && selectedDate <= today;
              return <article className={styles.calendarPlanCard} key={plan.id}>
                <div className={styles.calendarPlanTitle}><span className={styles.ghostMascot}><MoodSticker mood="happy" /></span><div><small>{plan.startTime}–{plan.endTime} · {plan.status === "DRAFT" ? "相談中" : ["DONE", "REFLECTED"].includes(plan.status) ? "おでかけ済み" : "予定"}</small><h3>{plan.title}</h3></div></div>
                <Link className={styles.planOpenLink} href={`/sessions/${plan.id}`}>プランを見る・修正する<ChevronRight size={17} /></Link>
                {canReflect ? <Button fullWidth className={styles.primaryButton} onClick={() => setReflecting(true)}>{recordsByDate.has(selectedDate) ? "振り返りを見る・編集する" : "この日を振り返る"}<MoodSticker mood="relaxed" /></Button> : <p className={styles.localNote}>{plan.status === "DRAFT" ? "まずはプランを決めよう。振り返りはデートのあとに。" : "デートが終わったら、ここから振り返れます。"}</p>}
              </article>;
            })}
          </div> : (selectedPlans.length > 0 || selectedRecord) && selectedDate <= today ? <>
            {selectedPlans.map((plan) => <Link key={plan.id} className={styles.reflectionPlanLink} href={`/sessions/${plan.id}`}><CalendarHeart size={15} /><span>{plan.title}</span><ChevronRight size={15} /></Link>)}
            <FeedbackEditor date={selectedDate} record={recordsByDate.get(selectedDate)} onSave={saveMemory} />
          </> : null}
        </HomeSheet>
      )}

      {panel && <HomeSheet key={panel} fixedHeight={panel === "memory"} title={panelTitles[panel]} onClose={() => setPanel(null)}>
        {panel === "plan" && <PlanForm key={`${planDate}:${planSeed?.wish ?? ""}:${planSeed?.meet?.id ?? ""}`} initialDate={planDate || today} seed={planSeed} onStepChange={setPlanStep} />}
        {panel === "records" && <div className={styles.recordList}>
          <p className={styles.sheetDescription}>シールひとつに、ふたりの思い出。{isFixture && " 今はサンプルの記録を表示しています。"}</p>
          {records.length === 0 && <p className={styles.emptyMessage}>まだ記録がありません。カレンダーの日付をタップして、最初のシールを貼ってみよう。</p>}
          {[...records].sort((a, b) => b.date.localeCompare(a.date)).map((record) => (
            <button type="button" key={record.date} className={styles.recordCard} onClick={() => { setPanel(null); openDay(record.date); }}>
              <MoodSticker mood={record.mood} /><span><small>{dateLabel(record.date)}</small><strong>{record.title}</strong><span>{record.note}</span></span><ChevronRight size={18} />
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
