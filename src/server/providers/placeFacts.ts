export type PlaceHoursRule = { days: number[]; open: string; close: string };

/** regular = 曜日ルール。dated = currentOpeningHours の日付キー (YYYY-MM-DD)。 */
export type SpotOpeningHours = {
  regular: PlaceHoursRule[];
  dated: Record<string, { open: string; close: string }>;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

type Period = {
  open?: {
    day?: number;
    hour?: number;
    minute?: number;
    date?: { year?: number; month?: number; day?: number };
  };
  close?: {
    day?: number;
    hour?: number;
    minute?: number;
    date?: { year?: number; month?: number; day?: number };
  };
};

export function emptySpotOpeningHours(): SpotOpeningHours {
  return { regular: [], dated: {} };
}

export function asSpotOpeningHours(
  input: SpotOpeningHours | PlaceHoursRule[] | undefined | null,
): SpotOpeningHours {
  if (!input) return emptySpotOpeningHours();
  if (Array.isArray(input)) return { regular: input, dated: {} };
  return {
    regular: Array.isArray(input.regular) ? input.regular : [],
    dated: input.dated && typeof input.dated === "object" ? input.dated : {},
  };
}

export function hasOpeningData(hours: SpotOpeningHours): boolean {
  return hours.regular.length > 0 || Object.keys(hours.dated).length > 0;
}

export function parsePlaceHours(raw: { periods?: Period[] } | null | undefined): PlaceHoursRule[] {
  if (!raw?.periods?.length) return [];
  const rules: PlaceHoursRule[] = [];
  for (const period of raw.periods) {
    if (period.open?.day == null || period.open.hour == null) continue;
    const open = `${pad(period.open.hour)}:${pad(period.open.minute ?? 0)}`;
    const close =
      period.close?.hour == null
        ? "24:00"
        : `${pad(period.close.hour)}:${pad(period.close.minute ?? 0)}`;
    rules.push({ days: [period.open.day], open, close });
  }
  return rules;
}

/**
 * currentOpeningHours.periods の date 付き枠だけを YYYY-MM-DD キーで返す。
 * date の無い period は捨てる（曜日フォールバックに混ぜない）。
 */
export function parseCurrentDatedHours(
  raw: { periods?: Period[] } | null | undefined,
): Record<string, { open: string; close: string }> {
  if (!raw?.periods?.length) return {};
  const out: Record<string, { open: string; close: string }> = {};
  for (const period of raw.periods) {
    const d = period.open?.date;
    if (d?.year == null || d?.month == null || d?.day == null) continue;
    if (period.open?.hour == null) continue;
    const key = `${d.year}-${pad(d.month)}-${pad(d.day)}`;
    const open = `${pad(period.open.hour)}:${pad(period.open.minute ?? 0)}`;
    const close =
      period.close?.hour == null
        ? "24:00"
        : `${pad(period.close.hour)}:${pad(period.close.minute ?? 0)}`;
    out[key] = { open, close };
  }
  return out;
}

export function parseYenRange(
  raw:
    | {
        startPrice?: { currencyCode?: string; units?: string };
        endPrice?: { currencyCode?: string; units?: string };
      }
    | null
    | undefined,
): { min: number; max: number } | null {
  if (!raw) return null;
  const currencies = [raw.startPrice?.currencyCode, raw.endPrice?.currencyCode].filter(
    (c): c is string => Boolean(c),
  );
  if (currencies.some((c) => c !== "JPY")) return null;
  const min = raw.startPrice?.units != null ? Number(raw.startPrice.units) : NaN;
  const max = raw.endPrice?.units != null ? Number(raw.endPrice.units) : NaN;
  if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  if (Number.isFinite(min)) return { min, max: min };
  if (Number.isFinite(max)) return { min: max, max };
  return null;
}

function assessWindow(
  open: string,
  close: string,
  startAt: string,
  endAt: string,
  toParts: (iso: string) => { hour: number; minute: number },
): "OPEN" | "CLOSED" {
  const start = toParts(startAt);
  const end = toParts(endAt);
  const openMin = hmToMin(open);
  const closeMin = hmToMin(close);
  const stayStart = start.hour * 60 + start.minute;
  const stayEnd = end.hour * 60 + end.minute;
  return stayStart >= openMin && stayEnd <= closeMin ? "OPEN" : "CLOSED";
}

/** 曜日ルールのみ（後方互換）。日付付き current は assessSpotOpening を使う。 */
export function assessHours(
  hours: PlaceHoursRule[] | undefined,
  startAt: string,
  endAt: string,
  toParts: (iso: string) => { hour: number; minute: number; weekday: number },
): "OPEN" | "CLOSED" | "UNKNOWN" {
  if (!hours || hours.length === 0) return "UNKNOWN";
  const start = toParts(startAt);
  const end = toParts(endAt);
  const rule = hours.find((h) => h.days.includes(start.weekday));
  if (!rule) return "CLOSED";
  return assessWindow(rule.open, rule.close, startAt, endAt, toParts);
}

/**
 * 判定日 (Asia/Tokyo の YYYY-MM-DD) が currentOpeningHours の dated にあればそれを使い、
 * 無ければ regularOpeningHours にフォールバック。
 * キャッシュが前日以前でも、日付キー不一致なら regular 側へ落ちるため誤判定しない。
 */
export function assessSpotOpening(
  source: SpotOpeningHours | PlaceHoursRule[] | undefined,
  startAt: string,
  endAt: string,
  toParts: (iso: string) => { date: string; hour: number; minute: number; weekday: number },
): "OPEN" | "CLOSED" | "UNKNOWN" {
  const hours = asSpotOpeningHours(source);
  const { date } = toParts(startAt);
  const dated = hours.dated[date];
  if (dated) return assessWindow(dated.open, dated.close, startAt, endAt, toParts);
  return assessHours(hours.regular, startAt, endAt, toParts);
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
