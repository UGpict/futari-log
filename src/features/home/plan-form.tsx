"use client";

import { TextInput, TextArea, SelectInput } from "@/components/text-input";

import { Button } from "@/components/button";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { PlanLoading } from "@/features/session/plan-loading";
import { api, fixturesEnabled } from "@/client/api";
import { useMe } from "@/client/hooks/use-me";
import { usePlaceSearch } from "@/client/hooks/use-place-search";
import { tokyoToday } from "@/config/public";
import type { PlaceCandidate } from "@/contracts";
import { MemoMascot } from "@/components/memo-mascot";
import { AiSparkIcon } from "@/components/ai-spark-icon";
import { Plus, ChevronLeft, ChevronRight, ArrowRight, Check, ChevronDown, Sparkles, CalendarHeart, MapPin, Flag, Beef, Fish, Pizza, CakeSlice, Utensils, Coffee, TreePine, Waves, Sandwich, Flame, Film, PawPrint, Gamepad2, Palette, ShoppingBag, Store, Landmark, BookOpen, Camera, type LucideIcon } from "lucide-react";
import styles from "./home.module.css";

const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const timeOptions = Array.from({ length: 34 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});
const timePresets = [
  { label: "朝から", start: "09:00", end: "15:00" },
  { label: "昼から", start: "11:00", end: "17:00" },
  { label: "午後から", start: "13:00", end: "18:00" },
  { label: "夜から", start: "17:00", end: "21:00" },
] as const;

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function PlaceSuggest({
  query,
  selected,
  search,
  onPick,
  label,
}: {
  query: string;
  selected: PlaceCandidate | null;
  search: { places: PlaceCandidate[]; state: string; error: string; pending: boolean };
  onPick: (place: PlaceCandidate) => void;
  label: string;
}) {
  if (selected) return <p className={styles.placeHint}>候補「{selected.name}」を使います</p>;
  if (query.trim().length < 2) return <p className={styles.placeHint}>候補から選ぶと、その場所の座標で探します。</p>;
  return (
    <div className={styles.placeSuggest} role="listbox" aria-label={label} aria-busy={search.pending || undefined}>
      {search.pending && !search.places.length ? <p className={styles.placeHint}>場所を探しています…</p> : null}
      {search.places.map((place) => (
        <button type="button" role="option" aria-selected={false} key={place.id} onClick={() => onPick(place)}>
          {place.name}
          {place.address && place.address !== place.name ? <small>{place.address}</small> : null}
        </button>
      ))}
      {!search.pending && search.state === "empty" ? <p className={styles.placeHint}>候補が見つかりません。別の呼び方で検索してください。</p> : null}
      {search.state === "failed" ? <p className={styles.error} role="alert">{search.error || "場所を検索できませんでした。"}</p> : null}
    </div>
  );
}

const stepNames = ["activity", "schedule", "details"] as const;

export function PlanForm({ initialDate, initialWish, initialStep = 0, fullPage = false, onStepChange }: {
  initialDate: string;
  initialWish?: string;
  initialStep?: number;
  fullPage?: boolean;
  onStepChange?: (step: number) => void;
}) {
  const router = useRouter();
  const formRoot = useRef<HTMLDivElement>(null);
  const { me, error: authError } = useMe();
  const [step, setStep] = useState(initialStep);
  const [nextCue, setNextCue] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  const [reached, setReached] = useState(initialStep);
  useEffect(() => {
    if (!fullPage) return;
    const syncStepFromHistory = () => {
      const routeStep = new URLSearchParams(window.location.search).get("step");
      const next = Math.max(0, stepNames.indexOf(routeStep as (typeof stepNames)[number]));
      setStep(next);
      setReached((previous) => Math.max(previous, next));
    };
    window.addEventListener("popstate", syncStepFromHistory);
    return () => window.removeEventListener("popstate", syncStepFromHistory);
  }, [fullPage]);
  useEffect(() => {
    if (!fullPage) return;
    const root = formRoot.current;
    if (!root) return;
    const viewport = window.visualViewport;
    let frame = 0;
    let field: HTMLElement | null = null;
    let followingFocus = false;

    const reveal = () => {
      if (!followingFocus || !field?.isConnected || document.activeElement !== field) return;
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const top = (viewport?.offsetTop ?? 0) + 16;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16;
      const rect = field.getBoundingClientRect();
      const delta = rect.top < top ? rect.top - top : Math.max(0, rect.bottom - bottom);
      if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
    };
    const schedule = () => {
      if (!followingFocus) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(reveal); });
    };
    const trackFocus = (event: FocusEvent) => {
      const target = event.target;
      field = target instanceof HTMLElement && target.matches("input:not([type=checkbox]):not([type=radio]), textarea") ? target : null;
      followingFocus = Boolean(field);
      if (followingFocus) schedule();
    };
    const stopFollowing = () => {
      if (!followingFocus) return;
      followingFocus = false;
      cancelAnimationFrame(frame);
    };

    root.addEventListener("focusin", trackFocus);
    viewport?.addEventListener("resize", schedule);
    window.addEventListener("pointerdown", stopFollowing, true);
    window.addEventListener("wheel", stopFollowing, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("focusin", trackFocus);
      viewport?.removeEventListener("resize", schedule);
      window.removeEventListener("pointerdown", stopFollowing, true);
      window.removeEventListener("wheel", stopFollowing, true);
    };
  }, [fullPage]);
  const [selected, setSelected] = useState<string[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const [showCategories, setShowCategories] = useState(true);
  const [selectingCategory, setSelectingCategory] = useState(false);
  const optionCarouselRef = useRef<HTMLDivElement>(null);
  const optionDragRef = useRef({ active: false, moved: false, startX: 0, scrollLeft: 0 });
  const [draggingOptions, setDraggingOptions] = useState(false);
  const [moreOptionsRight, setMoreOptionsRight] = useState(false);
  const categoryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (categoryTimer.current) clearTimeout(categoryTimer.current);
  }, []);
  function chooseCategory(id: string) {
    if (categoryTimer.current) return;
    if (category !== id) setSelected([]);
    setCategory(id);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShowCategories(false);
      return;
    }
    setSelectingCategory(true);
    categoryTimer.current = setTimeout(() => {
      categoryTimer.current = null;
      setShowCategories(false);
      setSelectingCategory(false);
    }, 120);
  }
  function startOptionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    optionDragRef.current = { active: true, moved: false, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveOptionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = optionDragRef.current;
    if (!drag.active) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 4) {
      drag.moved = true;
      setDraggingOptions(true);
    }
    if (drag.moved) event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  }
  function endOptionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!optionDragRef.current.active) return;
    optionDragRef.current.active = false;
    setDraggingOptions(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (optionDragRef.current.moved) window.setTimeout(() => { optionDragRef.current.moved = false; }, 0);
  }
  function updateOptionScroll() {
    const carousel = optionCarouselRef.current;
    if (!carousel) return;
    setMoreOptionsRight(carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 2);
  }
  const [category, setCategory] = useState<string | null>(null);
  const categories = [
    { id: "food", label: "おいしいもの", subtitle: "好きな味を、ふたりで。", wish: "おいしいものを楽しむデート", position: "0% 0%", options: [{ label: "お肉", icon: Beef }, { label: "お寿司", icon: Fish }, { label: "イタリアン", icon: Pizza }, { label: "スイーツ", icon: CakeSlice }, { label: "食べ歩き", icon: Utensils }] },
    { id: "relax", label: "のんびり過ごす", subtitle: "今日は、ふたりのペースで。", wish: "のんびり過ごすデート", position: "100% 0%", options: [{ label: "カフェ", icon: Coffee }, { label: "公園さんぽ", icon: TreePine }, { label: "海を眺める", icon: Waves }, { label: "ピクニック", icon: Sandwich }, { label: "温泉", icon: Flame }] },
    { id: "play", label: "遊びにいく", subtitle: "一緒なら、もっと楽しい。", wish: "遊びや体験を楽しむデート", position: "0% 100%", options: [{ label: "水族館", icon: Fish }, { label: "映画", icon: Film }, { label: "動物園", icon: PawPrint }, { label: "遊園地", icon: Gamepad2 }, { label: "ものづくり体験", icon: Palette }] },
    { id: "town", label: "街をぶらぶら", subtitle: "寄り道から、小さな発見。", wish: "街歩きや寄り道を楽しむデート", position: "100% 100%", options: [{ label: "ショッピング", icon: ShoppingBag }, { label: "雑貨屋めぐり", icon: Store }, { label: "美術館・展示", icon: Landmark }, { label: "本屋めぐり", icon: BookOpen }, { label: "街の写真を撮る", icon: Camera }] },
  ];
  const currentCategory = categories.find((item) => item.id === category) as (typeof categories)[number] | undefined;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (optionCarouselRef.current) optionCarouselRef.current.scrollLeft = 0;
      updateOptionScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [currentCategory?.id, showCategories]);
  function move(next: number) {
    if (advanceTimer.current) return;
    const commit = () => {
      advanceTimer.current = null;
      setAdvancing(false);
      setStep(next);
      onStepChange?.(next);
      setReached((previous) => Math.max(previous, next));
      if (fullPage) {
        const query = new URLSearchParams({ date: initialDate, step: stepNames[next] });
        if (initialWish) query.set("wish", initialWish);
        router.push(`/plans/new?${query.toString()}`, { scroll: false });
      }
      requestAnimationFrame(() => heading.current?.focus());
    };
    if (next !== step && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setNextCue((cue) => cue + 1);
      setAdvancing(true);
      advanceTimer.current = setTimeout(commit, 240);
    } else commit();
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    dateTokyo: initialDate,
    startTime: "13:00",
    endTime: "18:00",
    meetName: "",
    endName: "",
    meals: "6000",
    facilities: "3000",
    transit: "1000",
    self: initialWish || "",
    partner: "",
    locked: false,
    fixedName: "",
    fixedStart: "15:00",
    fixedEnd: "16:00",
    auto: false,
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [choosingDate, setChoosingDate] = useState<string | null>(null);
  const calendarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (calendarTimer.current) clearTimeout(calendarTimer.current); }, []);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const initial = parseDate(initialDate);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const [meetPlace, setMeetPlace] = useState<PlaceCandidate | null>(null);
  const [endPlace, setEndPlace] = useState<PlaceCandidate | null>(null);
  const bias = me ? { lat: me.demoLat, lng: me.demoLng } : null;
  const meetSearch = usePlaceSearch(form.meetName, bias);
  const endSearch = usePlaceSearch(form.endName, bias);

  const dateTokyo = form.dateTokyo || me?.demoDate || tokyoToday();
  const wish = [currentCategory?.wish, selected.filter((item) => item !== "おまかせ").length ? `気になること：${selected.filter((item) => item !== "おまかせ").join("、")}` : "", form.self.trim()].filter(Boolean).join("。") || "ふたりで楽しめる過ごし方を提案してほしい";
  const total = Number(form.meals) + Number(form.facilities) + Number(form.transit);
  const budgetTotalValue = [form.meals, form.facilities, form.transit].every((value) => value.trim() !== "") ? String(total) : "";
  const timingValid = Boolean(dateTokyo && form.startTime && form.endTime && form.startTime < form.endTime);
  const selectedTimePreset = timePresets.findIndex((item) => form.startTime === item.start && form.endTime === item.end);
  const placeValid = Boolean(meetPlace && (form.endName.trim() ? endPlace : true));
  const valid = Boolean(category || selected.length || form.self.trim()) && timingValid && placeValid && [form.meals, form.facilities, form.transit].every((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) && (!form.locked || (form.fixedName.trim() && form.fixedStart >= form.startTime && form.fixedEnd <= form.endTime && form.fixedStart < form.fixedEnd));
  const selectedDate = parseDate(dateTokyo);
  const calendarStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
  const calendarDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const dateLabel = `${selectedDate.getMonth() + 1}月${selectedDate.getDate()}日（${weekdays[selectedDate.getDay()]}）`;

  function changeCalendarMonth(offset: number) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function setTotalBudget(value: string) {
    if (value === "") {
      setForm({ ...form, meals: "", facilities: "", transit: "" });
      return;
    }
    const amount = Math.max(0, Number(value));
    if (!Number.isFinite(amount)) return;
    const meals = Math.round(amount * .6);
    const facilities = Math.round(amount * .3);
    setForm({ ...form, meals: String(meals), facilities: String(facilities), transit: String(amount - meals - facilities) });
  }

  function chooseDate(day: number) {
    if (choosingDate) return;
    const next = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const value = dateValue(next);
    setForm({ ...form, dateTokyo: value });
    setChoosingDate(value);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCalendarOpen(false);
      setChoosingDate(null);
      return;
    }
    calendarTimer.current = setTimeout(() => {
      calendarTimer.current = null;
      setCalendarOpen(false);
      setChoosingDate(null);
    }, 420);
  }

  async function submit() {
    if (!me || !valid || busy) return;
    const end = endPlace && form.endName.trim() ? endPlace : meetPlace;
    if (!meetPlace || !end) return;
    setBusy(true);
    const startedAt = Date.now();
    setError(null);
    try {
      let coupleId = me.coupleId;
      if (!coupleId) {
        const created = await api<{ id: string }>("/api/couples", {
          method: "POST",
          body: JSON.stringify({ isDemo: true }),
        });
        coupleId = created.id;
      }
      const date = dateTokyo;
      const lockedStart = `${date}T${form.fixedStart}:00+09:00`;
      const lockedEnd = `${date}T${form.fixedEnd}:00+09:00`;
      const session = await api<{ sessionId: string }>(`/api/couples/${coupleId}/sessions`, {
        method: "POST",
        body: JSON.stringify({
          dateTokyo,
          startTime: form.startTime,
          endTime: form.endTime,
          meet: {
            name: meetPlace.name,
            lat: meetPlace.lat,
            lng: meetPlace.lng,
            spotId: meetPlace.id,
            address: meetPlace.address,
          },
          end: {
            name: end.name,
            lat: end.lat,
            lng: end.lng,
            spotId: end.id,
            address: end.address ?? meetPlace.address,
          },
          budget: {
            mealsJpy: Number(form.meals),
            facilitiesJpy: Number(form.facilities),
            transitJpy: Number(form.transit),
          },
          preferences: [
            {
              id: "pref_self",
              subject: "SELF",
              content: wish,
              priority: "PREFER",
              source: "SELF_REPORT",
            },
            ...(form.partner.trim() ? [{
              id: "pref_partner",
              subject: "PARTNER",
              content: form.partner,
              priority: "PREFER",
              source: "PARTNER_STATEMENT_REPORTED",
            }] : []),
          ],
          fixedAppointments: form.locked
            ? [
                {
                  id: "fix_art",
                  label: form.fixedName.trim(),
                  spotId: null,
                  spotNameHint: form.fixedName.trim(),
                  startAt: lockedStart,
                  endAt: lockedEnd,
                  kind: "TIME_FIXED",
                },
              ]
            : [],
          autoApply: {
            enabled: form.auto,
            acknowledgedScope: form.auto
              ? "未着手・非固定の1件差し替え、PASS、予算増なし、終了を遅らせない、移動増なし"
              : null,
            validUntil: form.auto ? new Date(Date.now() + 86400000).toISOString() : null,
          },
          travelMode: "WALK",
          areaName: meetPlace.name,
          areaLat: meetPlace.lat,
          areaLng: meetPlace.lng,
          radiusMeters: 2500,
        }),
      });
      await api(`/api/sessions/${session.sessionId}/runs`, {
        method: "POST",
        headers: { "Idempotency-Key": `init-${session.sessionId}` },
        body: JSON.stringify({ kind: "INITIAL_PLAN" }),
      });
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1800 - (Date.now() - startedAt))));
      router.push(`/sessions/${session.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  if (busy) return <div className={styles.planningOverlay}><PlanLoading demo={fixturesEnabled()} /></div>;

  return (
    <div ref={formRoot} className={`${styles.planForm} ${styles.compactPlan} ${fullPage ? styles.planPageForm : ""}`}>
      <nav className={styles.planProgress} aria-label="プラン作成の進捗">
        {["過ごし方", "日時・場所", "予算・希望"].map((label, index) => <button type="button" key={label} disabled={index > reached || busy || advancing || selectingCategory} data-complete={index < reached} aria-current={step === index ? "step" : undefined} onClick={() => move(index)}><span>{index < reached ? <Check size={12} /> : index + 1}</span>{label}</button>)}
      </nav>
      {!fullPage && <div className={styles.planCompanion}><MemoMascot nextCue={nextCue} /></div>}
      <section key={step} className={`${styles.planStage} ${advancing ? styles.stageLeaving : styles.stageEntering}`} inert={advancing || selectingCategory}>
        {fullPage ? <div className={styles.planGuide}>
          <div className={styles.planGuideMascot}><MemoMascot nextCue={nextCue} /></div>
          <h3 ref={heading} tabIndex={-1} className={styles.planGuideSpeech}>{["どんな一日にしよう？", "いつ・どこで過ごそう？", "予算を決めよう"][step]}</h3>
        </div> : <h3 ref={heading} tabIndex={-1} className={step === 1 ? "sr-only" : undefined}>{["どんな一日にしよう？", "いつ・どこで過ごそう？", "予算を決めよう"][step]}</h3>}
        {step === 2 && <p className={styles.budgetLead}>食事・施設・交通費を含む、ふたり分の目安です</p>}

        {step === 0 && <>
          {(showCategories || !currentCategory) && <div className={`${styles.dateMoodGrid} ${selectingCategory ? styles.categoryFading : ""}`} aria-label="デートの気分">
            {categories.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => chooseCategory(item.id)} className={styles.dateMoodCard}>
              <span className={styles.dateMoodPhoto} style={{ backgroundPosition: item.position }} aria-hidden="true" />
              <span className={styles.dateMoodCaption}><strong>{item.label}</strong></span>
              <span className={styles.dateMoodCheck} aria-hidden="true">{category === item.id && <Check size={14} />}</span>
            </button>)}
          </div>}
          {!showCategories && currentCategory && <div className={styles.dateDetails} key={currentCategory.id}>
            <div className={styles.categoryDetailGroup}>
              <button type="button" className={styles.categorySummary} aria-label={`気分を選び直す（現在：${currentCategory.label}）`} onClick={() => setShowCategories(true)}>
                <span className={styles.categorySummaryBack}><ChevronLeft size={18} /></span>
                <span className={styles.categoryThumbnail} style={{ backgroundPosition: currentCategory.position }} aria-hidden="true" />
                <strong>{currentCategory.label}</strong>
                <small>複数選択可</small>
              </button>
              <div ref={optionCarouselRef} className={`${styles.planChips} ${styles.optionCarousel}`} data-dragging={draggingOptions} data-more-right={moreOptionsRight} aria-label="気になること（任意）" tabIndex={0} onScroll={updateOptionScroll}
                onPointerDown={startOptionDrag} onPointerMove={moveOptionDrag} onPointerUp={endOptionDrag} onPointerCancel={endOptionDrag}
                onClickCapture={(event) => {
                  if (!optionDragRef.current.moved) return;
                  event.preventDefault();
                  event.stopPropagation();
                  optionDragRef.current.moved = false;
                }} onWheel={(event) => {
                  const carousel = event.currentTarget;
                  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || carousel.scrollWidth <= carousel.clientWidth) return;
                  event.preventDefault();
                  carousel.scrollLeft += event.deltaY;
                }}>
                {currentCategory.options.map((option: { label: string; icon: LucideIcon }) => {
                  const OptionIcon = option.icon;
                  return <button type="button" key={option.label} aria-pressed={selected.includes(option.label)} onClick={() => setSelected(selected.includes(option.label) ? selected.filter((item) => item !== option.label) : [...selected, option.label])}><span className={styles.optionIcon}><OptionIcon size={14} /></span>{selected.includes(option.label) && <Check className={styles.optionCheck} size={12} />}{option.label}</button>;
                })}
              </div>
            </div>
            <label className={`${styles.formLabel} ${styles.wishField}`}><span>追加の希望 <small>選んだ内容に加えて伝えたいこと · 任意</small></span><TextArea rows={1} maxLength={1500} placeholder="海が見えるところで、ゆっくりしたい" value={form.self} onChange={(e) => setForm({ ...form, self: e.target.value })} /></label>
          </div>}
          {(showCategories || !currentCategory) && <div className={styles.aiWishArea}>
            <div className={styles.choiceDivider}><span>または</span></div>
            <button className={styles.aiChoice} type="button" aria-pressed={selected.includes("おまかせ")} onClick={() => { setCategory(null); setShowCategories(true); setSelected(selected.includes("おまかせ") ? [] : ["おまかせ"]); }}>
              <AiSparkIcon />
              <span><strong>全部おまかせ</strong><small>AIがふたりに合う過ごし方を提案</small></span>
              {selected.includes("おまかせ") && <Check size={16} />}
            </button>
            <label className={`${styles.formLabel} ${styles.wishField}`}><span>追加の希望 <small>選んだ内容に加えて伝えたいこと · 任意</small></span><TextArea rows={1} maxLength={1500} placeholder="海が見えるところで、ゆっくりしたい" value={form.self} onChange={(e) => setForm({ ...form, self: e.target.value })} /></label>
          </div>}
        </>}
        {step === 1 && <div className={styles.schedulePanel}>
          <section className={styles.scheduleSection} aria-label="日時">
            <div className={styles.scheduleSectionBody}>
          <div className={styles.scheduleDatePicker}>
            <button type="button" className={styles.scheduleDate} aria-expanded={calendarOpen} aria-controls="plan-calendar" onClick={() => { if (calendarTimer.current) return; setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); setCalendarOpen(!calendarOpen); }}>
              <CalendarHeart size={20} /><span><strong>{dateLabel}</strong></span><ChevronDown size={17} />
            </button>
            {calendarOpen && <div id="plan-calendar" className={styles.planCalendar} role="dialog" aria-label="日にちを選ぶ">
              <div className={styles.planCalendarHeader}>
                <button type="button" aria-label="前の月" onClick={() => changeCalendarMonth(-1)}><ChevronLeft size={18} /></button>
                <strong>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月</strong>
                <button type="button" aria-label="次の月" onClick={() => changeCalendarMonth(1)}><ChevronRight size={18} /></button>
              </div>
              <div className={styles.planCalendarWeekdays} aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
              <div className={styles.planCalendarDays}>{Array.from({ length: calendarStart }, (_, index) => <span key={`empty-${index}`} />)}{Array.from({ length: calendarDays }, (_, index) => {
                const day = index + 1;
                const value = dateValue(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                return <button type="button" key={day} aria-label={`${calendarMonth.getMonth() + 1}月${day}日`} aria-pressed={value === dateTokyo} aria-disabled={Boolean(choosingDate)} data-choosing={value === choosingDate || undefined} onClick={() => chooseDate(day)}>{day}</button>;
              })}</div>
            </div>}
          </div>
          <fieldset className={styles.scheduleTime}><legend className="sr-only">時間帯</legend>
            <div className={styles.timePresets} data-has-selection={selectedTimePreset >= 0} style={{ "--time-index": Math.max(0, selectedTimePreset) } as CSSProperties}>
              <span className={styles.timePresetIndicator} aria-hidden="true" />
              {timePresets.map((item) => <button type="button" key={item.label} aria-pressed={form.startTime === item.start && form.endTime === item.end} onClick={() => setForm({ ...form, startTime: item.start, endTime: item.end })}>{item.label}</button>)}
            </div>
            <div className={styles.inlineTimes}><label><span>開始</span><SelectInput aria-label="開始時刻" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</SelectInput><ChevronDown size={16} aria-hidden="true" /></label><span>〜</span><label><span>終了</span><SelectInput aria-label="終了時刻" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</SelectInput><ChevronDown size={16} aria-hidden="true" /></label></div>
          </fieldset>
            </div>
          </section>
          {!timingValid && <p className={styles.error} role="alert">終了は開始よりあとの時刻にしてね。</p>}
          <section className={styles.scheduleSection} aria-label="集合と解散">
            <div className={styles.meetingCard}>
              <div className={styles.routeStart}>
                <span className={styles.routeMarker}><MapPin size={14} /></span>
                <div className={styles.routeContent}><label><span>待ち合わせ</span><TextInput aria-label="集合場所" value={form.meetName} onChange={(e) => { setMeetPlace(null); setForm({ ...form, meetName: e.target.value }); }} placeholder="駅や目印になる場所" autoComplete="off" /></label>
                  <PlaceSuggest query={form.meetName} selected={meetPlace} search={meetSearch} label="集合場所の候補" onPick={(place) => { setMeetPlace(place); setForm((current) => ({ ...current, meetName: place.name })); }} />
                </div>
              </div>
              <details className={styles.routeEnd}><summary><span className={styles.routeMarker}><Flag size={13} /></span><span><small>解散</small><strong>{form.endName || "待ち合わせと同じ"}</strong></span><ChevronDown size={14} /></summary><div className={styles.routeEndEditor}><TextInput aria-label="解散場所" value={form.endName} onChange={(e) => { setEndPlace(null); setForm({ ...form, endName: e.target.value }); }} placeholder={meetPlace?.name ?? "解散場所"} autoComplete="off" />
                {form.endName.trim().length >= 2 || endPlace ? <PlaceSuggest query={form.endName} selected={endPlace} search={endSearch} label="解散場所の候補" onPick={(place) => { setEndPlace(place); setForm((current) => ({ ...current, endName: place.name })); }} /> : <p className={styles.placeHint}>別の場所で解散するときだけ入力できます。</p>}
              </div></details>
            </div>
          </section>
        </div>}
        {step === 2 && <div className={styles.finishPanel}>
          <fieldset className={styles.planFieldset}><legend className="sr-only">ふたり分の予算</legend><div className={styles.budgetChoices}>{[5000, 10000, 15000].map((amount) => <button type="button" key={amount} aria-pressed={total === amount} onClick={() => setForm({ ...form, meals: String(amount * .6), facilities: String(amount * .3), transit: String(amount * .1) })}>{total === amount && <Check size={14} />}{amount.toLocaleString()}円{amount === 10000 && <small>おすすめ</small>}</button>)}</div><details className={styles.planDetails}><summary>予算を自分で入力する <ChevronDown size={16} /></summary><label className={`${styles.formLabel} ${styles.totalBudgetInput}`}>ふたり分の合計金額<TextInput aria-label="ふたり分の合計予算" type="number" inputMode="numeric" min="0" step="500" value={budgetTotalValue} onChange={(e) => setTotalBudget(e.target.value)} /></label><p className={styles.planHint}>内訳はAIにおまかせできます</p><details className={styles.budgetBreakdown}><summary>食事・施設・交通の内訳も決める <ChevronDown size={14} /></summary>{([ ["meals", "食事"], ["facilities", "施設"], ["transit", "交通"] ] as const).map(([key, label]) => <label key={key} className={styles.formLabel}>{label}（円）<TextInput type="number" inputMode="numeric" min="0" step="100" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}</details></details></fieldset>
          <div className={styles.optionalHeading}><h4>ほかに伝えておくこと</h4><p>必要なものだけ追加できます</p></div>
          <details className={styles.planDetails}><summary><Plus size={14} />相手の希望を添える <span>任意</span></summary><label className={styles.formLabel}>相手が楽しみにしていること<TextArea rows={2} maxLength={2000} value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })} placeholder="パンケーキを食べたいって言っていた" /></label></details>
          <details className={styles.planDetails}><summary><Plus size={14} />時間が決まっている予定 <span>任意</span></summary><label className={styles.planToggle}><input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} />プランに固定の予定を入れる</label>{form.locked && <><label className={styles.formLabel}>場所・予定の名前<TextInput value={form.fixedName} onChange={(e) => setForm({ ...form, fixedName: e.target.value })} placeholder="美術館の展示を見る" /></label><div className={styles.planTimeRow}><label className={styles.formLabel}>開始<TextInput type="time" value={form.fixedStart} onChange={(e) => setForm({ ...form, fixedStart: e.target.value })} /></label><span>〜</span><label className={styles.formLabel}>終了<TextInput type="time" value={form.fixedEnd} onChange={(e) => setForm({ ...form, fixedEnd: e.target.value })} /></label></div><p className={styles.planHint}>デートの時間内で指定してください。予約は行いません。</p></>}</details>
          {!valid && <p role="alert" className={styles.error}>予算は0円以上、固定予定は名前とデート時間内の開始・終了を入力してね。</p>}
        </div>}
      </section>
      <footer className={styles.planFooter}>
        {(error || authError) && <p role="alert" className={styles.error}>{error || authError}</p>}
        {step === 2 && <p className={styles.planTotalSummary}><strong>ふたりで {total.toLocaleString()}円まで</strong><small>{form.startTime}〜{form.endTime} · {meetPlace?.name ?? "集合未選択"}</small></p>}
        {step === 0
          ? <Button fullWidth type="button" className={styles.primaryButton} disabled={advancing || selectingCategory || !category && !selected.length && !form.self.trim()} onClick={() => move(1)}>この内容で日時へ<ArrowRight size={18} /></Button>
          : <div className={styles.planFooterActions}>
              <Button fullWidth variant="secondary" type="button" className={styles.footerBackButton} disabled={advancing || selectingCategory || busy} onClick={() => move(step - 1)}><ChevronLeft size={18} />戻る</Button>
              {step === 1
                ? <Button fullWidth type="button" className={styles.primaryButton} disabled={advancing || !timingValid || !placeValid} onClick={() => move(2)}>予算と希望へ<ArrowRight size={18} /></Button>
                : <Button fullWidth type="button" className={styles.primaryButton} disabled={busy || !me || !valid} onClick={() => void submit()}><Sparkles size={18} />{!me ? "準備中…" : busy ? "プランを考えています…" : "この内容でプランをつくる"}</Button>}
            </div>}
      </footer>
      {me && me.blockers.length > 0 && step === 2 && <details className={styles.environmentDetails}><summary>実行環境について</summary>{me.blockers.map((blocker) => <p key={blocker.code}>{blocker.item}</p>)}</details>}
    </div>
  );
}
