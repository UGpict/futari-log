import { TIME_ZONE } from "@/config/public";

export function realNowIso(): string {
  return new Date().toISOString();
}

export function toTokyoParts(iso: string): {
  date: string;
  hour: number;
  minute: number;
  weekday: number;
} {
  const date = new Date(iso);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday ?? ""] ?? 0,
  };
}

export function tokyoDateTime(date: string, hm: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("date must be YYYY-MM-DD in Asia/Tokyo");
  }
  if (!/^\d{2}:\d{2}$/.test(hm)) {
    throw new Error("time must be HH:mm");
  }
  return `${date}T${hm}:00+09:00`;
}

export function addMinutes(iso: string, minutes: number): string {
  return toTokyoOffset(new Date(new Date(iso).getTime() + minutes * 60_000));
}

export function toTokyoOffset(date: Date): string {
  const p = toTokyoParts(date.toISOString());
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.date}T${pad(p.hour)}:${pad(p.minute)}:00+09:00`;
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000);
}

export function formatTokyo(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatTokyoHm(iso: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
