"use client";

import { TextInput, TextArea, SelectInput } from "@/components/text-input";

import { Button } from "@/components/button";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { PlanLoading } from "@/features/session/plan-loading";
import { api, ensureAuth, fixturesEnabled } from "@/client/api";
import { useMe } from "@/client/hooks/use-me";
import { usePlaceSearch } from "@/client/hooks/use-place-search";
import { SERVICE_AREA_NOTICE, tokyoToday } from "@/config/public";
import type { PlaceCandidate, TravelMode } from "@/contracts";
import type { PlanFormSeed } from "./home-suggestion";
import { MemoMascot } from "@/components/memo-mascot";
import { AiSparkIcon } from "@/components/ai-spark-icon";
import { PlanStickerIcon } from "@/components/plan-sticker-icon";
import { Plus, ChevronLeft, ChevronRight, Check, ChevronDown, Beef, Fish, Pizza, CakeSlice, Utensils, Coffee, TreePine, Waves, Sandwich, Flame, Film, PawPrint, Gamepad2, Palette, ShoppingBag, Store, Landmark, BookOpen, Camera, type LucideIcon } from "lucide-react";
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

function fitWishArea(area: HTMLTextAreaElement | null) {
  if (!area) return;
  area.style.height = "auto";
  const computed = window.getComputedStyle(area);
  const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
  const chrome = Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom) + Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
  const minHeight = Number.parseFloat(computed.minHeight) || 0;
  const maxHeight = lineHeight * 5 + chrome;
  const contentHeight = area.scrollHeight + Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
  area.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
  area.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
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
  if (selected) return null;
  if (query.trim().length < 2) return <p className={styles.placeHint}>候補から選ぶと、その場所の座標で探します。</p>;
  return (
    <div className={styles.placeSuggest} role="listbox" aria-label={label} aria-busy={search.pending || undefined}>
      {search.pending ? (
        <div className={styles.placeSearchLoading} role="status">
          <span className={styles.placeSearchAgent} aria-hidden="true">
            <Image src="/animations/planning-route-static.svg" alt="" width={28} height={28} unoptimized />
          </span>
          <span>
            場所を探しています
            <span className={styles.placeSearchDots} aria-hidden="true"><i /><i /><i /></span>
          </span>
        </div>
      ) : null}
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

export function PlanForm({ initialDate, initialWish, seed, seedParam, fromRunId, initialStep = 0, fullPage = false, onStepChange }: {
  initialDate: string;
  initialWish?: string;
  seed?: PlanFormSeed;
  /** URL の seed= をステップ遷移で維持する */
  seedParam?: string;
  /** 条件変更: /plans/new?from=runId で前回条件をプリフィル */
  fromRunId?: string;
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
  const seedWish = seed?.wish?.trim() || initialWish?.trim() || "";
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
    let expandedViewportHeight = viewport?.height ?? window.innerHeight;
    let lastViewportHeight = 0;
    let lastViewportTop = 0;
    let stableFrames = 0;

    const updateKeyboardInset = () => {
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const inset = Math.max(0, expandedViewportHeight - height - offsetTop);
      root.style.setProperty("--plan-keyboard-inset", inset > 48 ? `${Math.ceil(inset)}px` : "0px");
      return height;
    };

    const reveal = () => {
      if (!followingFocus || !field?.isConnected || document.activeElement !== field) return;
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      const top = (viewport?.offsetTop ?? 0) + 16;
      const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16;
      const rect = field.getBoundingClientRect();
      const targetCenter = top + (bottom - top) * .44;
      const delta = rect.top + rect.height / 2 - targetCenter;
      if (Math.abs(delta) > 1) {
        followingFocus = false;
        window.scrollBy({
          top: delta,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
      }
    };
    const waitForStableViewport = () => {
      if (!followingFocus) return;
      const height = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      if (Math.abs(height - lastViewportHeight) < .5 && Math.abs(offsetTop - lastViewportTop) < .5) stableFrames += 1;
      else stableFrames = 0;
      lastViewportHeight = height;
      lastViewportTop = offsetTop;
      if (stableFrames >= 2) reveal();
      else frame = requestAnimationFrame(waitForStableViewport);
    };
    const schedule = () => {
      if (!followingFocus) return;
      cancelAnimationFrame(frame);
      stableFrames = 0;
      lastViewportHeight = -1;
      lastViewportTop = -1;
      frame = requestAnimationFrame(waitForStableViewport);
    };
    const trackFocus = (event: FocusEvent) => {
      const target = event.target;
      field = target instanceof HTMLElement && target.matches("input:not([type=checkbox]):not([type=radio]), textarea") ? target : null;
      followingFocus = Boolean(field);
      const height = updateKeyboardInset();
      if (followingFocus && height < expandedViewportHeight - 48) schedule();
    };
    const trackViewportResize = () => {
      const height = updateKeyboardInset();
      if (!field || document.activeElement !== field) expandedViewportHeight = Math.max(expandedViewportHeight, height);
      if (followingFocus && height < expandedViewportHeight - 48) schedule();
    };
    const stopFollowing = () => {
      if (!followingFocus) return;
      followingFocus = false;
      cancelAnimationFrame(frame);
    };

    root.addEventListener("focusin", trackFocus);
    viewport?.addEventListener("resize", trackViewportResize);
    window.addEventListener("pointerdown", stopFollowing, true);
    window.addEventListener("wheel", stopFollowing, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("focusin", trackFocus);
      viewport?.removeEventListener("resize", trackViewportResize);
      window.removeEventListener("pointerdown", stopFollowing, true);
      window.removeEventListener("wheel", stopFollowing, true);
      root.style.removeProperty("--plan-keyboard-inset");
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
  }
  function moveOptionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = optionDragRef.current;
    if (!drag.active) return;
    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) > 6) {
      drag.moved = true;
      setDraggingOptions(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.scrollLeft - distance;
  }
  function endOptionDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!optionDragRef.current.active) return;
    optionDragRef.current.active = false;
    setDraggingOptions(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
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
        if (fromRunId) query.set("from", fromRunId);
        if (seedParam) query.set("seed", seedParam);
        else if (seedWish) query.set("wish", seedWish);
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
  const [customBudgetOpen, setCustomBudgetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    dateTokyo: initialDate,
    startTime: seed?.startTime ?? "13:00",
    endTime: seed?.endTime ?? "18:00",
    meetName: seed?.meet?.name ?? "",
    endName: "",
    meals: "6000",
    facilities: "3000",
    transit: "1000",
    self: seedWish,
    partner: "",
    locked: Boolean(seed?.fixed),
    fixedName: seed?.fixed?.label ?? "",
    fixedStart: seed?.fixed?.startTime ?? "15:00",
    fixedEnd: seed?.fixed?.endTime ?? "16:00",
    fixedSpotId: seed?.fixed?.spotId ?? null as string | null,
    travelMode: "WALK" as TravelMode,
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
  const [meetPlace, setMeetPlace] = useState<PlaceCandidate | null>(seed?.meet ?? null);
  const [endPlace, setEndPlace] = useState<PlaceCandidate | null>(null);
  const [fromHydrated, setFromHydrated] = useState(!fromRunId);
  useEffect(() => {
    if (!fromRunId) return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureAuth();
        const view = await api<{
          planningInput?: {
            dateTokyo: string;
            startTime: string;
            endTime: string;
            meet: { name: string; lat: number; lng: number; spotId: string | null; address?: string | null };
            end: { name: string; lat: number; lng: number; spotId: string | null; address?: string | null };
            budget: { mealsJpy: number | null; facilitiesJpy: number | null; transitJpy: number | null };
            preferences: Array<{ content: string }>;
            travelMode: TravelMode;
            fixedAppointments: Array<{ label: string; startAt: string; endAt: string; spotId: string | null }>;
          };
        }>(`/api/runs/${fromRunId}`);
        if (cancelled || !view.planningInput) return;
        const input = view.planningInput;
        const selfWish = input.preferences.map((p) => p.content).join("。");
        const fixed = input.fixedAppointments[0];
        const meet: PlaceCandidate = {
          id: input.meet.spotId ?? input.meet.name,
          name: input.meet.name,
          lat: input.meet.lat,
          lng: input.meet.lng,
          address: input.meet.address ?? null,
        };
        const end: PlaceCandidate = {
          id: input.end.spotId ?? input.end.name,
          name: input.end.name,
          lat: input.end.lat,
          lng: input.end.lng,
          address: input.end.address ?? null,
        };
        setForm((prev) => ({
          ...prev,
          dateTokyo: input.dateTokyo,
          startTime: input.startTime,
          endTime: input.endTime,
          meetName: meet.name,
          endName: end.name !== meet.name ? end.name : "",
          meals: input.budget.mealsJpy != null ? String(input.budget.mealsJpy) : prev.meals,
          facilities: input.budget.facilitiesJpy != null ? String(input.budget.facilitiesJpy) : prev.facilities,
          transit: input.budget.transitJpy != null ? String(input.budget.transitJpy) : prev.transit,
          self: selfWish || prev.self,
          travelMode: input.travelMode,
          locked: Boolean(fixed),
          fixedName: fixed?.label ?? "",
          fixedStart: fixed ? fixed.startAt.slice(11, 16) : prev.fixedStart,
          fixedEnd: fixed ? fixed.endAt.slice(11, 16) : prev.fixedEnd,
          fixedSpotId: fixed?.spotId ?? null,
        }));
        setMeetPlace(meet);
        setEndPlace(end.name !== meet.name ? end : null);
        setCalendarMonth(new Date(parseDate(input.dateTokyo).getFullYear(), parseDate(input.dateTokyo).getMonth(), 1));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "前回の条件を読み込めませんでした");
      } finally {
        if (!cancelled) setFromHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromRunId]);
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
  const fixedTimeInvalid = form.locked && (form.fixedStart < form.startTime || form.fixedEnd > form.endTime || form.fixedStart >= form.fixedEnd);
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
          preferences: (() => {
            const prefs = [
              ...(currentCategory
                ? [
                    {
                      id: "pref_category",
                      subject: "SELF" as const,
                      content: currentCategory.wish,
                      priority: "PREFER" as const,
                      source: "SELF_REPORT" as const,
                    },
                  ]
                : []),
              ...selected
                .filter((item) => item !== "おまかせ")
                .map((label, index) => ({
                  id: `pref_chip_${index}`,
                  subject: "SELF" as const,
                  content: label,
                  // Chip picks are concrete asks — planner must cover each fulfillable facet.
                  priority: "MUST" as const,
                  source: "SELF_REPORT" as const,
                })),
              ...(selected.includes("おまかせ") && !currentCategory
                ? [
                    {
                      id: "pref_omakase",
                      subject: "SELF" as const,
                      content: "おまかせで楽しめるデート",
                      priority: "PREFER" as const,
                      source: "SELF_REPORT" as const,
                    },
                  ]
                : []),
              ...(form.self.trim()
                ? [
                    {
                      id: "pref_self",
                      subject: "SELF" as const,
                      content: form.self.trim(),
                      priority: "PREFER" as const,
                      source: "SELF_REPORT" as const,
                    },
                  ]
                : []),
              ...(form.partner.trim()
                ? [
                    {
                      id: "pref_partner",
                      subject: "PARTNER" as const,
                      content: form.partner.trim(),
                      priority: "PREFER" as const,
                      source: "PARTNER_STATEMENT_REPORTED" as const,
                    },
                  ]
                : []),
            ];
            if (prefs.length) return prefs;
            return [
              {
                id: "pref_self",
                subject: "SELF" as const,
                content: wish,
                priority: "PREFER" as const,
                source: "SELF_REPORT" as const,
              },
            ];
          })(),
          fixedAppointments: form.locked
            ? [
                {
                  id: "fix_art",
                  label: form.fixedName.trim(),
                  spotId: form.fixedSpotId,
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
          travelMode: form.travelMode,
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
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1500 - (Date.now() - startedAt))));
      router.push(`/sessions/${session.sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  if (!fromHydrated) return <div className={`${styles.planningOverlay} ${fullPage ? styles.planPageLoading : ""}`}><PlanLoading demo={fixturesEnabled()} centered={fullPage} /></div>;
  if (busy) return <div className={`${styles.planningOverlay} ${fullPage ? styles.planPageLoading : ""}`}><PlanLoading demo={fixturesEnabled()} centered={fullPage} /></div>;

  return (
    <div ref={formRoot} className={`${styles.planForm} ${styles.compactPlan} ${fullPage ? styles.planPageForm : ""}`}>
      <nav className={styles.planProgress} aria-label="プラン作成の進捗">
        {["過ごし方", "日時・場所", "予算・確認"].map((label, index) => <button type="button" key={label} disabled={index > reached || busy || advancing || selectingCategory} data-complete={index < reached} aria-current={step === index ? "step" : undefined} onClick={() => move(index)}><span>{index < reached ? <Check size={12} /> : index + 1}</span>{label}</button>)}
      </nav>
      {!fullPage && <div className={styles.planCompanion}><MemoMascot nextCue={nextCue} /></div>}
      <section key={step} className={`${styles.planStage} ${advancing ? styles.stageLeaving : styles.stageEntering}`} inert={advancing || selectingCategory}>
        {fullPage ? <div className={styles.planGuide}>
          <div className={styles.planGuideMascot}><MemoMascot nextCue={nextCue} /></div>
          <h3 ref={heading} tabIndex={-1} className={styles.planGuideSpeech}>{["どんな一日にしよう？", "いつ・どこで過ごそう？", "予算を決めよう"][step]}</h3>
        </div> : <h3 ref={heading} tabIndex={-1} className={step === 1 ? "sr-only" : undefined}>{["どんな一日にしよう？", "いつ・どこで過ごそう？", "予算を決めよう"][step]}</h3>}
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
                }} onDragStart={(event) => event.preventDefault()}
                onWheel={(event) => {
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
            <label className={`${styles.formLabel} ${styles.wishField}`}><span>ほかに希望があれば <small>自分や相手が楽しみにしていること · 任意</small></span><TextArea ref={fitWishArea} rows={1} maxLength={1500} placeholder="パンケーキを食べたい、海が見えるところがいい" value={form.self} onInput={(e) => fitWishArea(e.currentTarget)} onChange={(e) => setForm({ ...form, self: e.target.value })} /></label>
          </div>}
          {(showCategories || !currentCategory) && <div className={styles.aiWishArea}>
            <div className={styles.choiceDivider}><span>または</span></div>
            <button className={styles.aiChoice} type="button" aria-pressed={selected.includes("おまかせ")} onClick={() => { setCategory(null); setShowCategories(true); setSelected(selected.includes("おまかせ") ? [] : ["おまかせ"]); }}>
              <AiSparkIcon />
              <span><strong>全部おまかせ</strong><small>AIがふたりに合う過ごし方を提案</small></span>
              {selected.includes("おまかせ") && <Check size={16} />}
            </button>
            <label className={`${styles.formLabel} ${styles.wishField}`}><span>ほかに希望があれば <small>自分や相手が楽しみにしていること · 任意</small></span><TextArea ref={fitWishArea} rows={1} maxLength={1500} placeholder="パンケーキを食べたい、海が見えるところがいい" value={form.self} onInput={(e) => fitWishArea(e.currentTarget)} onChange={(e) => setForm({ ...form, self: e.target.value })} /></label>
          </div>}
        </>}
        {step === 1 && <div className={styles.schedulePanel}>
          <section className={styles.scheduleSection} aria-label="日時">
            <div className={styles.scheduleSectionBody}>
          <div className={styles.scheduleDatePicker}>
            <button type="button" className={styles.scheduleDate} aria-expanded={calendarOpen} aria-controls="plan-calendar" onClick={() => { if (calendarTimer.current) return; setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)); setCalendarOpen(!calendarOpen); }}>
              <span className={styles.dateSticker}><PlanStickerIcon kind="calendar" /></span><span><strong>{dateLabel}</strong></span><ChevronDown size={17} />
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
            <div className={styles.inlineTimes}><label><SelectInput aria-label="開始時刻" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</SelectInput><ChevronDown size={16} aria-hidden="true" /></label><span>〜</span><label><SelectInput aria-label="終了時刻" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</SelectInput><ChevronDown size={16} aria-hidden="true" /></label></div>
          </fieldset>
            </div>
          </section>
          {!timingValid && <p className={styles.error} role="alert">終了は開始よりあとの時刻にしてね。</p>}
          <fieldset className={styles.transportPicker}>
            <legend className="sr-only">移動手段</legend>
            <p className={styles.transportHeading}>移動手段</p>
            <div>
              {([
                ["WALK", "徒歩", "walk"],
                ["DRIVE", "車", "drive"],
                ["TRANSIT", "交通機関", "transit"],
              ] as const).map(([value, label, icon]) => <button type="button" key={value} aria-pressed={form.travelMode === value} onClick={() => setForm({ ...form, travelMode: value })}><span className={styles.transportIcon}><PlanStickerIcon kind={icon} /></span><strong>{label}</strong><span className={styles.transportCheck} aria-hidden="true">{form.travelMode === value && <Check size={13} />}</span></button>)}
            </div>
          </fieldset>
          <p className={styles.areaNotice}>{SERVICE_AREA_NOTICE}</p>
          <section className={styles.scheduleSection} aria-label="集合と解散">
            <div className={styles.meetingCard}>
              <div className={styles.routeStart}>
                <svg className={styles.routePath} viewBox="0 0 36 100" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M18 0C3 15 31 27 17 43C4 57 29 72 18 100" />
                </svg>
                <span className={styles.routeMarker}><PlanStickerIcon kind="start" /></span>
                <div className={styles.routeContent}><label><span>待ち合わせ</span><TextInput aria-label="集合場所" value={form.meetName} onChange={(e) => { setMeetPlace(null); setForm({ ...form, meetName: e.target.value }); }} placeholder="駅や目印になる場所" autoComplete="off" /></label>
                  <PlaceSuggest query={form.meetName} selected={meetPlace} search={meetSearch} label="集合場所の候補" onPick={(place) => { setMeetPlace(place); setForm((current) => ({ ...current, meetName: place.name })); }} />
                </div>
              </div>
              <details className={styles.routeEnd}><summary><span className={styles.routeMarker}><PlanStickerIcon kind="goal" /></span><span><small>解散</small><strong>{form.endName || "待ち合わせと同じ"}</strong></span><ChevronDown size={14} /></summary><div className={styles.routeEndEditor}><TextInput aria-label="解散場所" value={form.endName} onChange={(e) => { setEndPlace(null); setForm({ ...form, endName: e.target.value }); }} placeholder={meetPlace?.name ?? "解散場所"} autoComplete="off" />
                {form.endName.trim().length >= 2 || endPlace ? <PlaceSuggest query={form.endName} selected={endPlace} search={endSearch} label="解散場所の候補" onPick={(place) => { setEndPlace(place); setForm((current) => ({ ...current, endName: place.name })); }} /> : null}
              </div></details>
            </div>
          </section>
          <details className={styles.fixedPlanCard} open={Boolean(seed?.fixed)} onToggle={(event) => {
            const locked = event.currentTarget.open;
            setForm((current) => current.locked === locked ? current : { ...current, locked });
          }}>
            <summary><span className={styles.fixedPlanIcon}><PlanStickerIcon kind="time" /></span><span><strong>予約や決まった予定</strong><small>動かせない予定があるときだけ</small></span><Plus size={16} /></summary>
            <div className={styles.fixedPlanEditor}>
              <div className={styles.fixedPlaceRow}><span className={styles.fixedPlaceIcon}><PlanStickerIcon kind="start" /></span><TextInput aria-label="場所・予定の名前" value={form.fixedName} onChange={(e) => setForm({ ...form, fixedName: e.target.value, fixedSpotId: null })} placeholder="場所や予定の名前" /></div>
              <div className={`${styles.inlineTimes} ${styles.fixedPlanTimes}`}><label><SelectInput aria-label="予定の開始時刻" value={form.fixedStart} onChange={(e) => setForm({ ...form, fixedStart: e.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</SelectInput><ChevronDown size={16} aria-hidden="true" /></label><span>〜</span><label><SelectInput aria-label="予定の終了時刻" value={form.fixedEnd} onChange={(e) => setForm({ ...form, fixedEnd: e.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{time}</option>)}</SelectInput><ChevronDown size={16} aria-hidden="true" /></label></div>
              {fixedTimeInvalid && <p className={styles.error} role="alert">デート時間内で指定してください。</p>}
            </div>
          </details>
        </div>}
        {step === 2 && <div className={styles.finishPanel}>
          <fieldset className={`${styles.planFieldset} ${styles.budgetCard}`}><legend className="sr-only">ふたり分の予算</legend>
            <div className={styles.budgetCardHeader}><span className={styles.budgetSticker}><PlanStickerIcon kind="budget" /></span><span><small>ふたりの予算</small><strong>{total.toLocaleString()}円まで</strong><em>食事・施設・交通費を含む、ふたり分の目安</em></span></div>
            <div className={styles.budgetChoices}>{[5000, 10000, 15000].map((amount) => <button type="button" key={amount} aria-pressed={!customBudgetOpen && total === amount} onClick={() => { setCustomBudgetOpen(false); setForm({ ...form, meals: String(amount * .6), facilities: String(amount * .3), transit: String(amount * .1) }); }}>{!customBudgetOpen && total === amount && <Check size={14} />}{amount.toLocaleString()}円{amount === 10000 && <small>おすすめ</small>}</button>)}<button type="button" aria-pressed={customBudgetOpen} onClick={() => setCustomBudgetOpen(true)}>自分で決める<small>金額を入力</small></button></div>
            {customBudgetOpen && <div className={styles.customBudgetEditor}><label className={`${styles.formLabel} ${styles.totalBudgetInput}`}>ふたり分の合計金額<TextInput aria-label="ふたり分の合計予算" type="number" inputMode="numeric" min="0" step="500" value={budgetTotalValue} onChange={(e) => setTotalBudget(e.target.value)} /></label><p className={styles.planHint}>食事・施設・交通の配分はAIにおまかせできます</p><details className={styles.budgetBreakdown}><summary>内訳も自分で決める <ChevronDown size={14} /></summary>{([ ["meals", "食事"], ["facilities", "施設"], ["transit", "交通"] ] as const).map(([key, label]) => <label key={key} className={styles.formLabel}>{label}（円）<TextInput type="number" inputMode="numeric" min="0" step="100" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}</details></div>}
          </fieldset>
          <section className={styles.planReview} aria-labelledby="plan-review-title">
            <div className={styles.reviewHeading}><span><PlanStickerIcon kind="spots" /></span><div><h4 id="plan-review-title">今回の内容</h4><p>この内容をもとにプランを考えます</p></div></div>
            <button type="button" onClick={() => move(0)}><span><small>過ごし方</small><strong>{currentCategory?.label ?? (selected.includes("おまかせ") ? "全部おまかせ" : "希望に合わせて")}</strong></span><em>変更</em></button>
            <button type="button" onClick={() => move(1)}><span><small>日時</small><strong>{dateLabel}・{form.startTime}〜{form.endTime}</strong></span><em>変更</em></button>
            <button type="button" onClick={() => move(1)}><span><small>場所</small><strong>{meetPlace?.name ?? "集合場所を選択"}{form.endName ? ` → ${form.endName}` : ""}</strong></span><em>変更</em></button>
          </section>
          <label className={`${styles.formLabel} ${styles.partnerWishField}`}>
            <span>相手の希望 <small>任意</small></span>
            <TextArea
              rows={2}
              maxLength={2000}
              value={form.partner}
              onChange={(e) => setForm({ ...form, partner: e.target.value })}
              placeholder="パンケーキを食べたいって言っていた"
            />
          </label>
        </div>}
      </section>
      <footer className={styles.planFooter}>
        {(error || authError) && <p role="alert" className={styles.error}>{error || authError}</p>}
        {step === 0
          ? <Button fullWidth type="button" className={styles.primaryButton} disabled={advancing || selectingCategory || !category && !selected.length && !form.self.trim()} onClick={() => move(1)}>日時・場所へ<ChevronRight size={18} /></Button>
          : <div className={styles.planFooterActions}>
              <Button fullWidth variant="secondary" type="button" className={styles.footerBackButton} disabled={advancing || selectingCategory || busy} onClick={() => move(step - 1)}><ChevronLeft size={18} />戻る</Button>
              {step === 1
                ? <Button fullWidth type="button" className={styles.primaryButton} disabled={advancing || !timingValid || !placeValid} onClick={() => move(2)}>予算・確認へ<ChevronRight size={18} /></Button>
                : <Button fullWidth type="button" className={styles.primaryButton} disabled={busy || !me || !valid} onClick={() => void submit()}>{!me ? "準備中…" : busy ? "考えています…" : "プランをつくる"}<ChevronRight size={18} /></Button>}
            </div>}
      </footer>
    </div>
  );
}
