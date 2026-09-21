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
  /** サーバー紐付け。無い場合は localStorage のみ。 */
  sessionId?: string;
  reflectionId?: string;
  contentVersion?: number;
  analysisStatus?: string;
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

function readRecords(raw: string): DateMemory[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const migrated = parsed.map((item: unknown) => {
      if (item && typeof item === "object" && "mood" in item && item.mood === "love") {
        return { ...item, mood: "happy" };
      }
      return item;
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
    moods.some((mood) => mood.id === item.mood)
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
 */
export function useDateJournal(uid?: string) {
  const isFixture = fixturesEnabled();
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
    if (saved) return saved;
    return isFixture ? calendarExamples : [];
  }, [raw, isFixture]);

  function saveLocal(record: DateMemory) {
    let current = records;
    const stored = getSnapshot();
    if (stored) current = readRecords(stored) ?? records;
    // 日付キー上書きはローカルのみ。sessionId 付きは同日でも別エントリとして残す余地を残し、
    // 既存の日付単位 UI 互換のため同一 date は1件に畳む（サーバー紐付けフィールドは保持）。
    const next = [...current.filter((item) => item.date !== record.date), record];
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(updateEvent));
  }

  function remove(date: string) {
    const stored = getSnapshot();
    const current = stored ? readRecords(stored) ?? records : records;
    const next = current.filter((item) => item.date !== date);
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event(updateEvent));
  }

  async function saveToServer(
    sessionId: string,
    record: DateMemory,
    opts?: { planVersion?: number | null; visits?: ReflectionDto["visits"] },
  ): Promise<DateMemory> {
    const body = {
      title: record.title,
      note: record.note,
      mood: record.mood,
      planVersion: opts?.planVersion ?? null,
      visits: opts?.visits ?? [],
      reflectionId: record.reflectionId,
      expectedContentVersion: record.contentVersion,
    };
    const result = await api<{ ok: true; reflection: ReflectionDto; analysisEnqueued: boolean }>(
      `/api/sessions/${sessionId}/reflections`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const mapped = toDateMemory(result.reflection) ?? {
      ...record,
      sessionId,
      reflectionId: result.reflection.id,
      contentVersion: result.reflection.contentVersion,
      analysisStatus: result.reflection.analysisStatus,
    };
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
  };
}
