"use client";

import { Button } from "@/components/button";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlanLoading } from "@/features/session/plan-loading";
import { api, fixturesEnabled } from "@/client/api";
import { useMe } from "@/client/hooks/use-me";
import { ModeBanner } from "@/components/mode-banner";
import { MemoMascot } from "@/components/memo-mascot";
import { Plus, ChevronLeft, ArrowRight, Check, ChevronDown, Sparkles, CalendarHeart, MapPinned } from "lucide-react";
import styles from "./home.module.css";

export function PlanForm({ initialDate, initialWish }: { initialDate: string; initialWish?: string }) {
  const router = useRouter();
  const { me, error: authError } = useMe();
  const [step, setStep] = useState(0);
  const [nextCue, setNextCue] = useState(0);
  const [advancing, setAdvancing] = useState(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  const [reached, setReached] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [freeWish, setFreeWish] = useState(Boolean(initialWish));
  const heading = useRef<HTMLHeadingElement>(null);
  const [showCategories, setShowCategories] = useState(true);
  const [selectingCategory, setSelectingCategory] = useState(false);
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
  const [category, setCategory] = useState<string | null>(null);
  const categories = [
    { id: "food", label: "おいしいもの", subtitle: "好きな味を、ふたりで。", wish: "おいしいものを楽しむデート", position: "0% 0%", question: "何か食べたいもの、ある？", options: ["お肉", "お寿司", "イタリアン", "スイーツ", "食べ歩き"] },
    { id: "relax", label: "のんびり過ごす", subtitle: "今日は、ふたりのペースで。", wish: "のんびり過ごすデート", position: "100% 0%", question: "どんなふうに、ひと息つこう？", options: ["カフェ", "公園さんぽ", "海を眺める", "ピクニック", "温泉"] },
    { id: "play", label: "遊びにいく", subtitle: "一緒なら、もっと楽しい。", wish: "遊びや体験を楽しむデート", position: "0% 100%", question: "気になる遊びは、ある？", options: ["水族館", "映画", "動物園", "遊園地", "ものづくり体験"] },
    { id: "town", label: "街をぶらぶら", subtitle: "寄り道から、小さな発見。", wish: "街歩きや寄り道を楽しむデート", position: "100% 100%", question: "どんな寄り道をしよう？", options: ["ショッピング", "雑貨屋めぐり", "美術館・展示", "本屋めぐり", "街の写真を撮る"] },
  ];
  const currentCategory = categories.find((item) => item.id === category);
  function move(next: number) {
    if (advanceTimer.current) return;
    const commit = () => {
      advanceTimer.current = null;
      setAdvancing(false);
      setStep(next);
      setReached((previous) => Math.max(previous, next));
      requestAnimationFrame(() => { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
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

  const dateTokyo = form.dateTokyo || me?.demoDate || "2026-09-19";
  const meetName =
    form.meetName ||
    (me?.demoAreaName?.includes("名古屋") ? "名古屋駅" : me?.demoAreaName) ||
    "名古屋駅";
  const wish = [currentCategory?.wish, selected.filter((item) => item !== "おまかせ").length ? `気になること：${selected.filter((item) => item !== "おまかせ").join("、")}` : "", form.self.trim()].filter(Boolean).join("。") || "ふたりで楽しめる過ごし方を提案してほしい";
  const total = Number(form.meals) + Number(form.facilities) + Number(form.transit);
  const timingValid = Boolean(dateTokyo && form.startTime && form.endTime && form.startTime < form.endTime);
  const valid = Boolean(category || selected.length || form.self.trim()) && timingValid && [form.meals, form.facilities, form.transit].every((value) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) && (!form.locked || (form.fixedName.trim() && form.fixedStart >= form.startTime && form.fixedEnd <= form.endTime && form.fixedStart < form.fixedEnd));

  async function submit() {
    if (!me || !valid || busy) return;
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
            name: meetName,
            lat: me.demoLat,
            lng: me.demoLng,
            spotId: "mock:nagoya-station",
          },
          end: {
            name: form.endName || meetName,
            lat: me.demoLat,
            lng: me.demoLng,
            spotId: "mock:nagoya-station",
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
          areaName: me.demoAreaName,
          areaLat: me.demoLat,
          areaLng: me.demoLng,
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
    <div className={`${styles.planForm} ${styles.compactPlan}`}>
      <nav className={styles.planProgress} aria-label="プラン作成の進捗">
        {["過ごし方", "日時と場所", "仕上げ"].map((label, index) => <button type="button" key={label} disabled={index > reached || busy || advancing || selectingCategory} data-complete={index < reached} aria-current={step === index ? "step" : undefined} onClick={() => move(index)}><span>{index < reached ? <Check size={12} /> : index + 1}</span>{label}</button>)}
      </nav>
      <div className={styles.planCompanion}><MemoMascot nextCue={nextCue} /></div>
      <section key={step} className={`${styles.planStage} ${advancing ? styles.stageLeaving : styles.stageEntering}`} inert={advancing || selectingCategory}>
        <h3 ref={heading} tabIndex={-1} className={step > 0 ? "sr-only" : undefined}>{["どんな一日にしよう？", "いつ・どこで過ごそう？", "大事にしたいことは？"][step]}</h3>

        {step === 0 && <>
          {(showCategories || !currentCategory) && <div className={`${styles.dateMoodGrid} ${selectingCategory ? styles.categoryFading : ""}`} aria-label="デートの気分">
            {categories.map((item) => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => chooseCategory(item.id)} className={styles.dateMoodCard}>
              <span className={styles.dateMoodPhoto} style={{ backgroundPosition: item.position }} aria-hidden="true" />
              <span className={styles.dateMoodCaption}><strong>{item.label}</strong></span>
              <span className={styles.dateMoodCheck} aria-hidden="true">{category === item.id && <Check size={14} />}</span>
            </button>)}
          </div>}
          {!showCategories && currentCategory && <div className={styles.dateDetails} key={currentCategory.id}>
            <button type="button" className={styles.categoryBack} onClick={() => setShowCategories(true)}><ChevronLeft size={14} />気分を選び直す</button>
            <div className={styles.selectedCategoryPhoto} style={{ backgroundPosition: currentCategory.position }}><strong>{currentCategory.label}</strong></div>
            <h4 className={styles.categoryQuestion}>{currentCategory.question}</h4>
            <p className={styles.planHint}>選ばずにおまかせでもOK・複数選択可</p>
            <div className={styles.planChips} aria-label="気になること（任意）">{currentCategory.options.map((option) => <button type="button" key={option} aria-pressed={selected.includes(option)} onClick={() => setSelected(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option])}>{selected.includes(option) && <Check size={13} />}{option}</button>)}</div>
          </div>}
          <div className={styles.planChips}><button type="button" aria-pressed={selected.includes("おまかせ")} onClick={() => { setCategory(null); setShowCategories(true); setSelected(selected.includes("おまかせ") ? [] : ["おまかせ"]); }}><Sparkles size={14} />全部おまかせ</button><button type="button" aria-expanded={freeWish} onClick={() => setFreeWish(!freeWish)}><Plus size={14} />希望を書く</button></div>
          {freeWish && <label className={styles.formLabel}>こんなこともしたい<textarea rows={2} maxLength={1500} placeholder="海が見えるところで、ゆっくりしたい" value={form.self} onChange={(e) => setForm({ ...form, self: e.target.value })} /></label>}
        </>}
        {step === 1 && <div className={styles.schedulePanel}>
          <label className={styles.scheduleDate}><CalendarHeart size={19} /><span className="sr-only">日にち</span><input aria-label="日にち" type="date" value={dateTokyo} onChange={(e) => setForm({ ...form, dateTokyo: e.target.value })} /></label>
          <fieldset className={styles.scheduleTime}><legend className="sr-only">時間帯</legend>
            <div className={styles.timePresets}>{[{ label: "昼から", start: "11:00", end: "17:00" }, { label: "午後から", start: "13:00", end: "18:00" }, { label: "夜から", start: "17:00", end: "21:00" }].map((item) => <button type="button" key={item.label} aria-pressed={form.startTime === item.start && form.endTime === item.end} onClick={() => setForm({ ...form, startTime: item.start, endTime: item.end })}>{item.label}</button>)}</div>
            <div className={styles.inlineTimes}><input aria-label="開始時刻" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} /><span>—</span><input aria-label="終了時刻" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} /></div>
          </fieldset>
          {!timingValid && <p className={styles.error} role="alert">終了は開始よりあとの時刻にしてね。</p>}
          <div className={styles.meetingCard}><label><MapPinned size={18} /><span>待ち合わせ</span><input aria-label="集合場所" value={meetName} onChange={(e) => setForm({ ...form, meetName: e.target.value })} placeholder="駅や目印になる場所" /></label>
            <details><summary>{form.endName ? `解散：${form.endName}` : "解散も同じ場所"}<ChevronDown size={13} /></summary><input aria-label="解散場所" value={form.endName || meetName} onChange={(e) => setForm({ ...form, endName: e.target.value })} /></details>
          </div>
        </div>}
        {step === 2 && <div className={styles.finishPanel}>
          <details className={styles.finishReview}><summary>{dateTokyo.slice(5).replace("-", "/")} · {form.startTime}〜{form.endTime}<span>条件を確認 <ChevronDown size={13} /></span></summary><p>{wish}</p><p>集合：{meetName} / 解散：{form.endName || meetName}</p><button type="button" onClick={() => move(0)}>過ごし方を変更</button><button type="button" onClick={() => move(1)}>日時・場所を変更</button></details>
          <fieldset className={styles.planFieldset}><legend>予算 <span>ふたり合計・交通費込み</span></legend><div className={styles.planChips}>{[5000, 10000, 15000].map((amount) => <button type="button" key={amount} aria-pressed={total === amount} onClick={() => setForm({ ...form, meals: String(amount * .6), facilities: String(amount * .3), transit: String(amount * .1) })}>{amount.toLocaleString()}円</button>)}</div>          <details className={styles.planDetails}><summary>金額・内訳を調整 <ChevronDown size={14} /></summary><p className={styles.planHint}>食事 {form.meals}円 / 施設 {form.facilities}円 / 交通 {form.transit}円</p>{([ ["meals", "食事"], ["facilities", "施設"], ["transit", "交通"] ] as const).map(([key, label]) => <label key={key} className={styles.formLabel}>{label}（円）<input type="number" min="0" step="100" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}</details></fieldset>
          <details className={styles.planDetails}><summary><Plus size={14} />相手の希望を添える <span>任意</span></summary><label className={styles.formLabel}>相手が楽しみにしていること<textarea rows={2} maxLength={2000} value={form.partner} onChange={(e) => setForm({ ...form, partner: e.target.value })} placeholder="パンケーキを食べたいって言っていた" /></label></details>
          <details className={styles.planDetails}><summary><Plus size={14} />時間が決まっている予定 <span>任意</span></summary><label className={styles.planToggle}><input type="checkbox" checked={form.locked} onChange={(e) => setForm({ ...form, locked: e.target.checked })} />プランに固定の予定を入れる</label>{form.locked && <><label className={styles.formLabel}>場所・予定の名前<input value={form.fixedName} onChange={(e) => setForm({ ...form, fixedName: e.target.value })} placeholder="美術館の展示を見る" /></label><div className={styles.planTimeRow}><label className={styles.formLabel}>開始<input type="time" value={form.fixedStart} onChange={(e) => setForm({ ...form, fixedStart: e.target.value })} /></label><span>〜</span><label className={styles.formLabel}>終了<input type="time" value={form.fixedEnd} onChange={(e) => setForm({ ...form, fixedEnd: e.target.value })} /></label></div><p className={styles.planHint}>デートの時間内で指定してください。予約は行いません。</p></>}</details>
          {!valid && <p role="alert" className={styles.error}>予算は0円以上、固定予定は名前とデート時間内の開始・終了を入力してね。</p>}
        </div>}
      </section>
      <footer className={styles.planFooter}>
        {(error || authError) && <p role="alert" className={styles.error}>{error || authError}</p>}
        {step < 2 ? <Button fullWidth type="button" className={styles.primaryButton} disabled={advancing || selectingCategory || (step === 0 ? !category && !selected.length && !form.self.trim() : !timingValid)} onClick={() => move(step + 1)}>{step === 0 ? (selected.some((item) => item !== "おまかせ") || form.self.trim() ? "この希望で進む" : "この気分でおまかせ") : "仕上げに進む"}<ArrowRight size={18} /></Button> : <><p className={styles.planHint}>{form.startTime}〜{form.endTime} · ふたりで{total.toLocaleString()}円まで</p><Button fullWidth type="button" className={styles.primaryButton} disabled={busy || !me || !valid} onClick={() => void submit()}><Sparkles size={18} />{!me ? "準備中…" : busy ? "プランを考えています…" : "この条件でプランをつくる"}</Button></>}
      </footer>
      {me && step === 2 && <details className={styles.environmentDetails}><summary>実行環境について</summary><ModeBanner runtime={me.runtime} emulator={me.emulator} dataBackend={me.dataBackend} authBackend={me.authBackend} />{me.blockers.map((blocker) => <p key={blocker.code}>{blocker.item}</p>)}</details>}
    </div>
  );
}
