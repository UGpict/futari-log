export type PlaceHoursRule = { days: number[]; open: string; close: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

type Period = {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
};

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
  const openMin = hmToMin(rule.open);
  const closeMin = hmToMin(rule.close);
  const stayStart = start.hour * 60 + start.minute;
  const stayEnd = end.hour * 60 + end.minute;
  return stayStart >= openMin && stayEnd <= closeMin ? "OPEN" : "CLOSED";
}

function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
