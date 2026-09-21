"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { moods, type Mood } from "@/components/mood-sticker";
import { calendarExamples } from "@/fixtures/calendar";
import { api, fixturesEnabled } from "../api";
import type { ReflectionDto } from "@/contracts/reflection";

export type DateMemory = {
  date: string;
  title: string;
  note: string;
  mood: Mood;
  /** Display-only tournament sample. Never persist to Firestore. */
  demo?: boolean;
  /** サーバー紐付け。無い場合は localStorage のみ。 */
  sessionId?: string;
  reflectionId?: string;
  contentVersion?: number;
  analysisStatus?: string;
  /** 旧1枚形式。読み込み時に stickerDataUrls へ移行する。 */
  stickerDataUrl?: string;
  /** 端末内で生成した透過ステッカー（最大3枚）。サーバーへは送信しない。 */
  stickerDataUrls?: string[];
};

const updateEvent = "futari-journal-changed";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(updateEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(updateEvent, listener);
  };
}

export function tokyoToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

function withoutDemoFlag(record: DateMemory): DateMemory {
  const rest = { ...record };
  delete rest.demo;
  return rest;
}

function realOnly(records: DateMemory[]): DateMemory[] {
  return records.filter((item) => !item.demo).map(withoutDemoFlag);
}

function mergeWithDemo(real: DateMemory[], demo: DateMemory[]): DateMemory[] {
  const byDate = new Map<string, DateMemory>();
  for (const row of demo) {
    if (row.demo) byDate.set(row.date, row);
  }
  for (const row of real) {
    byDate.set(row.date, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function readRecords(raw: string): DateMemory[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const migrated = parsed.map((item: unknown) => {
      if (!item || typeof item !== "object") return item;
      const next = { ...item } as Record<string, unknown>;
      if (next.mood === "love") next.mood = "happy";
      if (typeof next.stickerDataUrl === "string" && !Array.isArray(next.stickerDataUrls)) {
        next.stickerDataUrls = [next.stickerDataUrl];
      }
      return next;
    });
    return migrated.every(isMemory) ? migrated : null;
  } catch {
    return null;
  }
}

function isMemory(value: unknown): value is DateMemory {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DateMemory>;
  return (
    typeof item.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
    typeof item.title === "string" &&
    typeof item.note === "string" &&
    moods.some((mood) => mood.id === item.mood) &&
    (item.stickerDataUrl === undefined || (typeof item.stickerDataUrl === "string" && item.stickerDataUrl.startsWith("data:image/"))) &&
    (item.stickerDataUrls === undefined || (Array.isArray(item.stickerDataUrls) && item.stickerDataUrls.length <= 3 && item.stickerDataUrls.every((url) => typeof url === "string" && url.startsWith("data:image/")))) &&
    (item.demo === undefined || item.demo === true || item.demo === false)
  );
}

function toDateMemory(dto: ReflectionDto): DateMemory | null {
  if (!dto.dateTokyo || !dto.mood) return null;
  if (!moods.some((m) => m.id === dto.mood)) return null;
  return {
    date: dto.dateTokyo,
    title: dto.title || "ふたりで過ごした日",
    note: dto.note,
    mood: dto.mood,
    sessionId: dto.sessionId,
    reflectionId: dto.id,
    contentVersion: dto.contentVersion,
    analysisStatus: dto.analysisStatus,
  };
}

/**
 * ローカル記録は削除・他ユーザー取り込み・同日セッション勝手紐付けをしない。
 * サーバー保存は sessionId があるときだけ別経路で行う。
 * demoRecords は表示合成のみ（localStorage / Firestore に書かない）。
 */
export function useDateJournal(uid?: string, demoRecords: DateMemory[] = []) {
  const isFixture = fixturesEnabled();
  const demoEnabled = demoRecords.length > 0 && !isFixture;
  const key = `futari-log:journal:${isFixture ? "fixture" : uid ?? "guest"}:v1`;
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const today = useSyncExternalStore(subscribe, tokyoToday, () => "");
  const records = useMemo<DateMemory[]>(() => {
    const saved = raw ? readRecords(raw) : null;
    if (isFixture) {
      return saved ? realOnly(saved) : calendarExamples;
    }
    const real = saved ? realOnly(saved) : [];
    if (!demoEnabled) return real;
    return mergeWithDemo(real, demoRecords.filter((row) => row.demo));
  }, [raw, isFixture, demoEnabled, demoRecords]);

  function saveLocal(record: DateMemory) {
    const clean = withoutDemoFlag(record);
    let current = realOnly(records);
    const stored = getSnapshot();
    if (stored) current = realOnly(readRecords(stored) ?? current);
    // 日付キー上書きはローカルのみ。sessionId 付きは同日でも別エントリとして残す余地を残し、
    // 既存の日付単位 UI 互換のため同一 date は1件に畳む（サーバー紐付けフィールドは保持）。
    const next = [...current.filter((item) => item.date !== clean.date), clean];
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(updateEvent));
  }

  function remove(date: string) {
    const stored = getSnapshot();
    const current = stored ? realOnly(readRecords(stored) ?? []) : realOnly(records);
    const target = current.find((item) => item.date === date);
    // デモのみの日はストレージに無いので何もしない（API も呼ばない）。
    if (!target) return;
    const next = current.filter((item) => item.date !== date);
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(updateEvent));
  }

  async function saveToServer(
    sessionId: string,
    record: DateMemory,
    opts?: { planVersion?: number | null; visits?: ReflectionDto["visits"] },
  ): Promise<DateMemory> {
    const clean = withoutDemoFlag(record);
    const body = {
      title: clean.title,
      note: clean.note,
      mood: clean.mood,
      planVersion: opts?.planVersion ?? null,
      visits: opts?.visits ?? [],
      reflectionId: clean.reflectionId,
      expectedContentVersion: clean.contentVersion,
    };
    const result = await api<{ ok: true; reflection: ReflectionDto; analysisEnqueued: boolean }>(
      `/api/sessions/${sessionId}/reflections`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const mapped = toDateMemory(result.reflection) ?? {
      ...clean,
      sessionId,
      reflectionId: result.reflection.id,
      contentVersion: result.reflection.contentVersion,
      analysisStatus: result.reflection.analysisStatus,
    };
    mapped.stickerDataUrls = clean.stickerDataUrls;
    saveLocal(mapped);
    return mapped;
  }

  async function loadServerReflection(sessionId: string): Promise<ReflectionDto | null> {
    try {
      const result = await api<{ reflections: ReflectionDto[] }>(
        `/api/sessions/${sessionId}/reflections`,
      );
      return result.reflections.at(-1) ?? null;
    } catch {
      return null;
    }
  }

  return {
    records,
    save: saveLocal,
    saveToServer,
    loadServerReflection,
    remove,
    today,
    isFixture,
    demoStickersActive: demoEnabled,
  };
}
