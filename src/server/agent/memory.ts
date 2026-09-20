import { realNowIso, sameTokyoDate } from "@/lib/time";
import type { CoupleBundle } from "@/server/repositories/store";
import { AGENT_IDS, FACT_CAP, NOTE_CAP, type AgentId, type AgentMemories, type AgentMemory } from "./types";

const KEEP_KEYS = new Set(["daily"]);

export function dailyFresh(fetchedAt: unknown): boolean {
  return typeof fetchedAt === "string" && sameTokyoDate(fetchedAt);
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
    mem.facts[input.factKey] = input.factValue ?? true;
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
