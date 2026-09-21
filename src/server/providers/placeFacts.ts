import { parsePlacesPriceBand } from "@/domain/price/accounting";

/** Weekday rule from regularOpeningHours (day 0=Sun). Multiple rules may share a day (split hours). */
export type PlaceHoursRule = {
  days: number[];
  open: string;
  close: string;
  /** True when Places omitted close (24h sentinel open 00:00). */
  alwaysOpen?: boolean;
};

/** One continuous open window (absolute Tokyo instants as offset ISO strings). */
export type OpeningInterval = {
  openAt: string;
  /** null = no close (24h / always-open period). */
  closeAt: string | null;
  truncatedOpen?: boolean;
  truncatedClose?: boolean;
};

/**
 * Snapshot of Places currentOpeningHours.
 * Coverage is the ~7 day window (fetch day .. +6). Inside coverage we do not
 * fall back to regularOpeningHours — missing periods mean closed or unknown.
 */
export type CurrentOpeningSnapshot = {
  coverageStart: string;
  coverageEnd: string;
  specialDays: string[];
  intervals: OpeningInterval[];
  /** API returned periods: [] — never open / temp closed for the window. */
  neverOpen: boolean;
  /**
   * Raw periods existed but none had usable open.date (cannot treat as dated
   * currentOpeningHours). Inside coverage → UNKNOWN, not CLOSED/OPEN via guess.
   */
  incomplete: boolean;
  fetchedAt?: string;
};

/**
 * regular = weekday schedule.
 * current = dated currentOpeningHours window.
 * dated = legacy single-slot map (cache compat); migrated via asSpotOpeningHours.
 */
export type SpotOpeningHours = {
  regular: PlaceHoursRule[];
  current?: CurrentOpeningSnapshot | null;
  /** @deprecated Prefer current.intervals. Kept for older cache / catalog fixtures. */
  dated?: Record<string, { open: string; close: string } | { open: string; close: string }[]>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

type PeriodPoint = {
  day?: number;
  hour?: number;
  minute?: number;
  date?: { year?: number; month?: number; day?: number };
  truncated?: boolean;
};

type Period = { open?: PeriodPoint; close?: PeriodPoint };

type CurrentRaw = {
  periods?: Period[] | null;
  specialDays?: { date?: { year?: number; month?: number; day?: number } }[] | null;
};

export function emptySpotOpeningHours(): SpotOpeningHours {
  return { regular: [], current: null, dated: {} };
}

export function addTokyoDays(dateTokyo: string, days: number): string {
  const [y, m, d] = dateTokyo.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + days);
  const dt = new Date(utc);
  return dateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function pointDateKey(p: PeriodPoint | undefined): string | null {
  const d = p?.date;
  if (d?.year == null || d?.month == null || d?.day == null) return null;
  return dateKey(d.year, d.month, d.day);
}

function pointHm(p: PeriodPoint | undefined): string | null {
  if (p?.hour == null) return null;
  return `${pad(p.hour)}:${pad(p.minute ?? 0)}`;
}

function tokyoIso(dateTokyo: string, hm: string): string {
  return `${dateTokyo}T${hm}:00+09:00`;
}

export function asSpotOpeningHours(
  input: SpotOpeningHours | PlaceHoursRule[] | undefined | null,
): SpotOpeningHours {
  if (!input) return emptySpotOpeningHours();
  if (Array.isArray(input)) return { regular: input, current: null, dated: {} };
  const dated = input.dated && typeof input.dated === "object" ? input.dated : {};
  let current = input.current ?? null;
  if (current && typeof (current as { incomplete?: boolean }).incomplete !== "boolean") {
    // Older cache snapshots omit incomplete — treat as complete dated data.
    current = { ...current, incomplete: false };
  }
  if (!current && Object.keys(dated).length > 0) {
    current = legacyDatedToCurrent(dated);
  }
  return {
    regular: Array.isArray(input.regular) ? input.regular : [],
    current,
    dated,
  };
}

function legacyDatedToCurrent(
  dated: Record<string, { open: string; close: string } | { open: string; close: string }[]>,
): CurrentOpeningSnapshot {
  const keys = Object.keys(dated).sort();
  const intervals: OpeningInterval[] = [];
  for (const key of keys) {
    const raw = dated[key];
    const slots = Array.isArray(raw) ? raw : [raw];
    for (const slot of slots) {
      intervals.push({
        openAt: tokyoIso(key, slot.open),
        closeAt: slot.close === "24:00" ? tokyoIso(addTokyoDays(key, 1), "00:00") : tokyoIso(key, slot.close),
      });
    }
  }
  return {
    coverageStart: keys[0]!,
    coverageEnd: keys[keys.length - 1]!,
    specialDays: [],
    intervals,
    neverOpen: false,
    incomplete: false,
  };
}

export function hasOpeningData(hours: SpotOpeningHours): boolean {
  return (
    hours.regular.length > 0 ||
    Boolean(
      hours.current &&
        (hours.current.intervals.length > 0 || hours.current.neverOpen || hours.current.incomplete),
    ) ||
    Object.keys(hours.dated ?? {}).length > 0
  );
}

export function parsePlaceHours(raw: { periods?: Period[] } | null | undefined): PlaceHoursRule[] {
  if (!raw?.periods?.length) return [];
  const rules: PlaceHoursRule[] = [];
  for (const period of raw.periods) {
    if (period.open?.day == null || period.open.hour == null) continue;
    const open = `${pad(period.open.hour)}:${pad(period.open.minute ?? 0)}`;
    const alwaysOpen =
      period.close == null && period.open.day === 0 && period.open.hour === 0 && (period.open.minute ?? 0) === 0;
    const close =
      period.close?.hour == null
        ? alwaysOpen
          ? "24:00"
          : "24:00"
        : `${pad(period.close.hour)}:${pad(period.close.minute ?? 0)}`;
    rules.push({
      days: [period.open.day],
      open,
      close,
      alwaysOpen: alwaysOpen || period.close == null,
    });
  }
  return rules;
}

/**
 * Parse currentOpeningHours into a coverage snapshot.
 * Returns null when the field is absent (do not invent a 7-day closed window).
 * @param fetchDateTokyo — Asia/Tokyo calendar date of the Places request (window start).
 *
 * Google Places (New): currentOpeningHours covers midnight request-day .. 23:59 +6d.
 * Empty periods[] = never open in that window. Periods include calendar dates;
 * specialDays marks exceptional dates. truncated = hours cut at window edge.
 */
export function parseCurrentOpeningHours(
  raw: CurrentRaw | null | undefined,
  fetchDateTokyo: string,
): CurrentOpeningSnapshot | null {
  if (raw == null) return null;

  const coverageStart = fetchDateTokyo;
  const coverageEnd = addTokyoDays(fetchDateTokyo, 6);
  const specialDays = (raw.specialDays ?? [])
    .map((s) => {
      const d = s.date;
      if (d?.year == null || d?.month == null || d?.day == null) return null;
      return dateKey(d.year, d.month, d.day);
    })
    .filter((x): x is string => Boolean(x));

  // Explicit empty array: place is never open (e.g. closed for renovation).
  if (Array.isArray(raw.periods) && raw.periods.length === 0) {
    return {
      coverageStart,
      coverageEnd,
      specialDays,
      intervals: [],
      neverOpen: true,
      incomplete: false,
      fetchedAt: undefined,
    };
  }

  const rawPeriods = raw.periods ?? [];
  const intervals: OpeningInterval[] = [];
  let skippedWithoutDate = 0;
  for (const period of rawPeriods) {
    const openDate = pointDateKey(period.open);
    const openHm = pointHm(period.open);
    if (!openDate || !openHm) {
      if (period.open) skippedWithoutDate += 1;
      continue;
    }
    const closeDate = pointDateKey(period.close) ?? openDate;
    const closeHm = pointHm(period.close);
    const alwaysOpen = period.close == null;
    intervals.push({
      openAt: tokyoIso(openDate, openHm),
      closeAt: alwaysOpen
        ? null
        : closeHm
          ? tokyoIso(closeDate, closeHm === "24:00" ? "00:00" : closeHm)
          : tokyoIso(addTokyoDays(openDate, 1), "00:00"),
      truncatedOpen: Boolean(period.open?.truncated),
      truncatedClose: Boolean(period.close?.truncated),
    });
  }

  // Periods without dates are not usable as dated current hours — do not invent CLOSED.
  const incomplete = intervals.length === 0 && skippedWithoutDate > 0;

  return {
    coverageStart,
    coverageEnd,
    specialDays,
    intervals,
    neverOpen: false,
    incomplete,
    fetchedAt: undefined,
  };
}

/** @deprecated Use parseCurrentOpeningHours. Legacy single map for older call sites/tests. */
export function parseCurrentDatedHours(
  raw: { periods?: Period[] } | null | undefined,
): Record<string, { open: string; close: string }> {
  const snap = parseCurrentOpeningHours(raw ?? { periods: [] }, "1970-01-01");
  const out: Record<string, { open: string; close: string }> = {};
  for (const iv of snap?.intervals ?? []) {
    const openDate = iv.openAt.slice(0, 10);
    const open = iv.openAt.slice(11, 16);
    const close = iv.closeAt ? iv.closeAt.slice(11, 16) : "24:00";
    // Last write wins for same date (legacy); prefer keeping first via array in new path.
    if (!out[openDate]) out[openDate] = { open, close };
  }
  return out;
}

/**
 * 互換用。完全な JPY min+max のみ返す。start のみは null（二人料金にしない）。
 * 新規は parsePlacesPriceBand を使う。
 */
export function parseYenRange(
  raw:
    | {
        startPrice?: { currencyCode?: string; units?: string };
        endPrice?: { currencyCode?: string; units?: string };
      }
    | null
    | undefined,
): { min: number; max: number } | null {
  const parsed = parsePlacesPriceBand(raw);
  if (!parsed) return null;
  const { minJpy, maxJpy } = parsed.band;
  if (minJpy != null && maxJpy != null) return { min: minJpy, max: maxJpy };
  return null;
}

export { parsePlacesPriceBand };

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

function inCoverage(snap: CurrentOpeningSnapshot, dateTokyo: string): boolean {
  return dateTokyo >= snap.coverageStart && dateTokyo <= snap.coverageEnd;
}

function stayFitsInterval(stayStartMs: number, stayEndMs: number, iv: OpeningInterval): "OPEN" | "CLOSED" | "UNKNOWN" {
  const openMs = Date.parse(iv.openAt);
  if (!Number.isFinite(openMs)) return "UNKNOWN";
  if (iv.closeAt == null) {
    // Always-open period: open if stay starts at/after openAt (within reason).
    return stayStartMs >= openMs ? "OPEN" : "CLOSED";
  }
  const closeMs = Date.parse(iv.closeAt);
  if (!Number.isFinite(closeMs)) return "UNKNOWN";
  if (iv.truncatedClose && stayEndMs > closeMs) return "UNKNOWN";
  if (iv.truncatedOpen && stayStartMs < openMs) return "UNKNOWN";
  return stayStartMs >= openMs && stayEndMs <= closeMs ? "OPEN" : "CLOSED";
}

function assessAgainstIntervals(
  intervals: OpeningInterval[],
  startAt: string,
  endAt: string,
): "OPEN" | "CLOSED" | "UNKNOWN" {
  const stayStartMs = Date.parse(startAt);
  const stayEndMs = Date.parse(endAt);
  if (!Number.isFinite(stayStartMs) || !Number.isFinite(stayEndMs)) return "UNKNOWN";
  let sawUnknown = false;
  for (const iv of intervals) {
    const r = stayFitsInterval(stayStartMs, stayEndMs, iv);
    if (r === "OPEN") return "OPEN";
    if (r === "UNKNOWN") sawUnknown = true;
  }
  return sawUnknown ? "UNKNOWN" : "CLOSED";
}

/** Expand weekday rules into absolute intervals that could cover the stay. */
export function expandRegularIntervals(
  rules: PlaceHoursRule[],
  startAt: string,
  toParts: (iso: string) => { date: string; weekday: number },
): OpeningInterval[] {
  if (!rules.length) return [];
  const { date: stayDate, weekday } = toParts(startAt);
  const prevDate = addTokyoDays(stayDate, -1);
  const prevWeekday = (weekday + 6) % 7;
  const out: OpeningInterval[] = [];

  for (const rule of rules) {
    if (rule.days.includes(weekday)) {
      if (rule.alwaysOpen || (rule.open === "00:00" && rule.close === "24:00")) {
        out.push({ openAt: tokyoIso(stayDate, "00:00"), closeAt: null, truncatedClose: false });
        continue;
      }
      const openAt = tokyoIso(stayDate, rule.open);
      const overnight = hmToMin(rule.close) <= hmToMin(rule.open);
      const closeAt = overnight
        ? tokyoIso(addTokyoDays(stayDate, 1), rule.close)
        : rule.close === "24:00"
          ? tokyoIso(addTokyoDays(stayDate, 1), "00:00")
          : tokyoIso(stayDate, rule.close);
      out.push({ openAt, closeAt });
    }
    // Overnight window that started yesterday and closes today.
    if (
      rule.days.includes(prevWeekday) &&
      !rule.alwaysOpen &&
      hmToMin(rule.close) <= hmToMin(rule.open) &&
      rule.close !== "24:00"
    ) {
      out.push({
        openAt: tokyoIso(prevDate, rule.open),
        closeAt: tokyoIso(stayDate, rule.close),
      });
    }
  }
  return out;
}

/** Weekday-only assessment (compat). */
export function assessHours(
  hours: PlaceHoursRule[] | undefined,
  startAt: string,
  endAt: string,
  toParts: (iso: string) => { date: string; hour: number; minute: number; weekday: number },
): "OPEN" | "CLOSED" | "UNKNOWN" {
  if (!hours || hours.length === 0) return "UNKNOWN";
  const intervals = expandRegularIntervals(hours, startAt, toParts);
  if (!intervals.length) return "CLOSED";
  return assessAgainstIntervals(intervals, startAt, endAt);
}

/**
 * Opening assessment (Places New semantics):
 *
 * Regular fallback ONLY when:
 * - currentOpeningHours is absent, OR
 * - plan date is outside the ~7 day coverage window (fetch day .. +6).
 *
 * Inside coverage:
 * - neverOpen (periods: []) → CLOSED
 * - incomplete (periods lacked dates) → UNKNOWN (do not guess CLOSED/OPEN)
 * - no interval covers the stay day → CLOSED (API omits closed days; no regular)
 * - temp-closure risk unresolved (truncated edge / ambiguous) → UNKNOWN, never OPEN
 * - stay must fit entirely inside one continuous interval (split hours / break)
 */
export function assessSpotOpening(
  source: SpotOpeningHours | PlaceHoursRule[] | undefined,
  startAt: string,
  endAt: string,
  toParts: (iso: string) => { date: string; hour: number; minute: number; weekday: number },
): "OPEN" | "CLOSED" | "UNKNOWN" {
  const hours = asSpotOpeningHours(source);
  const { date } = toParts(startAt);
  const current = hours.current;

  if (current && inCoverage(current, date)) {
    if (current.neverOpen) return "CLOSED";
    if (current.incomplete) return "UNKNOWN";
    const dayIntervals = current.intervals.filter((iv) => {
      const openDate = iv.openAt.slice(0, 10);
      const closeDate = iv.closeAt?.slice(0, 10) ?? openDate;
      return date >= openDate && date <= closeDate;
    });
    if (dayIntervals.length === 0) {
      // Dated current window has no open period that day → closed that day.
      // Includes specialDays that are shut. Do not fall back to regular.
      return "CLOSED";
    }
    return assessAgainstIntervals(dayIntervals, startAt, endAt);
  }

  // Outside coverage or no current snapshot → regularOpeningHours.
  return assessHours(hours.regular, startAt, endAt, toParts);
}
