import { realNowIso, sameTokyoDate } from "@/lib/time";
import { CACHE_TTL_MS } from "@/config/settings";
import type { CoupleBundle } from "@/server/repositories/store";
import { AGENT_IDS, FACT_CAP, NOTE_CAP, type AgentId, type AgentMemories, type AgentMemory } from "./types";

const KEEP_KEYS = new Set(["daily"]);
const BLOCKED_TRAVEL_KEYS = new Set(["walkLongAcknowledged", "walkLongAck"]);

export function dailyFresh(fetchedAt: unknown): boolean {
  return typeof fetchedAt === "string" && sameTokyoDate(fetchedAt);
}

export function travelFactReusable(raw: unknown, ttlMs = CACHE_TTL_MS.travel): boolean {
  if (!raw || typeof raw !== "object") return false;
  const fetchedAt = (raw as { fetchedAt?: unknown }).fetchedAt;
  if (typeof fetchedAt !== "string" || !dailyFresh(fetchedAt)) return false;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return Number.isFinite(age) && age <= ttlMs;
}

export function pruneTravelFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const timed: Array<{ key: string; fetchedAt: string; raw: unknown }> = [];
  for (const [key, raw] of Object.entries(facts)) {
    if (BLOCKED_TRAVEL_KEYS.has(key) || key.startsWith("leg:")) continue;
    if (key === "daily") {
      const fetchedAt = raw && typeof raw === "object" ? (raw as { fetchedAt?: unknown }).fetchedAt : null;
      if (dailyFresh(fetchedAt)) out.daily = raw;
      continue;
    }
    if (!key.startsWith("travel:")) continue;
    if (!travelFactReusable(raw)) continue;
    timed.push({ key, fetchedAt: (raw as { fetchedAt: string }).fetchedAt, raw });
  }
  timed.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
  const room = Math.max(0, FACT_CAP - Object.keys(out).length);
  for (const item of timed.slice(-room)) out[item.key] = item.raw;
  return out;
}

export function emptyMemory(agentId: AgentId): AgentMemory {
  return { agentId, updatedAt: realNowIso(), notes: [], facts: {} };
}

export function readMemories(couple: CoupleBundle): AgentMemories {
  const stored = couple.agentMemories ?? {};
  const out: AgentMemories = {};
  for (const id of AGENT_IDS) {
    const raw = stored[id];
    out[id] = raw
      ? {
          agentId: id,
          updatedAt: raw.updatedAt,
          notes: Array.isArray(raw.notes) ? raw.notes.slice(-NOTE_CAP) : [],
          facts: raw.facts && typeof raw.facts === "object" ? { ...raw.facts } : {},
        }
      : emptyMemory(id);
  }
  return out;
}

export function remember(
  memories: AgentMemories,
  agentId: AgentId,
  input: { note?: string; factKey?: string; factValue?: unknown },
): void {
  const mem = memories[agentId] ?? emptyMemory(agentId);
  mem.updatedAt = realNowIso();
  if (input.note) {
    mem.notes = [...mem.notes.filter((n) => n !== input.note), input.note].slice(-NOTE_CAP);
  }
  if (input.factKey) {
    if (agentId === "travel" && (BLOCKED_TRAVEL_KEYS.has(input.factKey) || input.factKey.startsWith("leg:"))) {
      memories[agentId] = mem;
      return;
    }
    mem.facts[input.factKey] = input.factValue ?? true;
    if (agentId === "travel") {
      mem.facts = pruneTravelFacts(mem.facts);
    }
    const keys = Object.keys(mem.facts);
    if (keys.length > FACT_CAP) {
      for (const key of keys) {
        if (Object.keys(mem.facts).length <= FACT_CAP) break;
        if (KEEP_KEYS.has(key)) continue;
        delete mem.facts[key];
      }
    }
  }
  memories[agentId] = mem;
}

export function writeMemories(couple: CoupleBundle, memories: AgentMemories): void {
  couple.agentMemories = memories;
}
