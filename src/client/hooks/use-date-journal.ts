"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { moods, type Mood } from "@/components/mood-sticker";
import { calendarExamples } from "@/fixtures/calendar";
import { fixturesEnabled } from "../api";

export type DateMemory = { date: string; title: string; note: string; mood: Mood };
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
    // Keep records from the initial five-sticker prototype when combining its
    // two positive stickers into the new heart. Never rewrite storage on read.
    const migrated = parsed.map((item: unknown) => {
      if (item && typeof item === "object" && "mood" in item && item.mood === "love") {
        return { ...item, mood: "happy" };
      }
      return item;
    });
    return migrated.every(isMemory) ? migrated : null;
  } catch { return null; }
}

function isMemory(value: unknown): value is DateMemory {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DateMemory>;
  return typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && typeof item.title === "string" && typeof item.note === "string"
    && moods.some((mood) => mood.id === item.mood);
}

export function useDateJournal(uid?: string) {
  const isFixture = fixturesEnabled();
  const key = `futari-log:journal:${isFixture ? "fixture" : uid ?? "guest"}:v1`;
  const getSnapshot = useCallback(() => {
    try { return window.localStorage.getItem(key) ?? ""; }
    catch { return ""; }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const today = useSyncExternalStore(subscribe, tokyoToday, () => "");
  const records = useMemo<DateMemory[]>(() => {
    const saved = raw ? readRecords(raw) : null;
    if (saved) return saved;
    return isFixture ? calendarExamples : [];
  }, [raw, isFixture]);

  function save(record: DateMemory) {
    // Read at save time so a second tab cannot silently overwrite a recent entry.
    let current = records;
    const stored = getSnapshot();
    if (stored) current = readRecords(stored) ?? records;
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

  return { records, save, remove, today, isFixture };
}
