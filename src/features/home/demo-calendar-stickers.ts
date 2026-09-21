import type { Mood } from "@/components/mood-sticker";
import type { DateMemory } from "@/client/hooks/use-date-journal";

/** Offsets (days before anchor) matching the historical fixture calendar look. */
const DEMO_OFFSETS_BEFORE_ANCHOR = [18, 13, 7, 3, 2] as const;

const DEMO_TEMPLATES: { title: string; note: string; mood: Mood }[] = [
  { title: "ゆっくり、公園さんぽ", note: "たくさん笑って、寄り道して。何でもない時間がいちばん。", mood: "happy" },
  { title: "美術館と、ちょっと歩きすぎた日", note: "展示は楽しかったけど、次は休憩も多めに。", mood: "tired" },
  { title: "気になっていたカフェへ", note: "ケーキを食べて「また来たい」と言っていた。", mood: "happy" },
  { title: "いつもの街で、のんびり", note: "予定を詰めずに過ごした、ふたりの休日。", mood: "relaxed" },
  { title: "雨の日のおでかけ", note: "行きたかったお店はお休み。また一緒に行こうね。", mood: "sad" },
];

export type DemoCalendarConfig = {
  enabled: boolean;
  /** Asia/Tokyo YYYY-MM-DD. Samples are placed on days before this date. */
  anchorDate: string;
};

export function isValidTokyoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Add signed day delta to a Tokyo calendar date (UTC noon trick). */
export function addTokyoCalendarDays(dateTokyo: string, deltaDays: number): string {
  const [y, m, d] = dateTokyo.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays);
  const dt = new Date(utc);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Build demo-only journal rows for calendar display.
 * Never write these to Firestore / reflections / memory / planning.
 */
export function buildDemoCalendarRecords(anchorDate: string): DateMemory[] {
  if (!isValidTokyoDate(anchorDate)) return [];
  return DEMO_OFFSETS_BEFORE_ANCHOR.map((offset, index) => {
    const template = DEMO_TEMPLATES[index]!;
    return {
      date: addTokyoCalendarDays(anchorDate, -offset),
      title: template.title,
      note: template.note,
      mood: template.mood,
      demo: true as const,
    };
  });
}

/** Real local/server rows win on the same date. Demo rows never replace them. */
export function mergeJournalWithDemo(
  real: DateMemory[],
  demo: DateMemory[],
): DateMemory[] {
  const byDate = new Map<string, DateMemory>();
  for (const row of demo) {
    if (row.demo) byDate.set(row.date, row);
  }
  for (const row of real) {
    byDate.set(row.date, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
