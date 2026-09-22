import type { Mood } from "@/components/mood-sticker";
import type { DateMemory } from "@/client/hooks/use-date-journal";

/** Offsets (days before anchor) matching the historical fixture calendar look. */
const DEMO_OFFSETS_BEFORE_ANCHOR = [18, 13, 7, 3, 2] as const;

/**
 * Pre-baked photo stickers under public/images/demo-stickers/.
 * Tournament demo calendar samples (`DEMO_CALENDAR_STICKERS`).
 */
const DEMO_TEMPLATES: { title: string; note: string; mood: Mood; stickerDataUrls: string[] }[] = [
  {
    title: "カフェでひと息",
    note: "アイスラテを分け合って、ゆっくり話した。",
    mood: "happy",
    stickerDataUrls: ["/images/demo-stickers/drink.webp"],
  },
  {
    title: "ラーメンで締めの日",
    note: "お腹いっぱい。次はもう少し歩かない作戦。",
    mood: "tired",
    stickerDataUrls: ["/images/demo-stickers/ramen.webp"],
  },
  {
    title: "気になっていたケーキ屋へ",
    note: "ショートケーキを食べて「また来たい」と言っていた。",
    mood: "happy",
    stickerDataUrls: ["/images/demo-stickers/cake.webp"],
  },
  {
    title: "甘いものとカフェで、のんびり",
    note: "予定を詰めずに過ごした、ふたりの休日。",
    mood: "relaxed",
    stickerDataUrls: ["/images/demo-stickers/drink.webp", "/images/demo-stickers/cake.webp"],
  },
  {
    title: "温泉の看板を見つけた日",
    note: "また一緒に行きたいね、と話した帰り道。",
    mood: "sad",
    stickerDataUrls: ["/images/demo-stickers/onsen.webp"],
  },
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
      stickerDataUrls: template.stickerDataUrls,
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
