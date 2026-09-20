import type { AppEvent, EventType } from "@/domain/schemas";

export const AGENT_IDS = ["scout", "weather", "planner", "place", "travel"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

export type AgentMemory = {
  agentId: AgentId;
  updatedAt: string;
  notes: string[];
  facts: Record<string, unknown>;
};

export type AgentMemories = Partial<Record<AgentId, AgentMemory>>;

export const NOTE_CAP = 12;
export const FACT_CAP = 80;

export type AgentLog = (
  agent: AgentId,
  type: EventType,
  summary: string,
  extra?: Partial<AppEvent>,
) => Promise<void>;

