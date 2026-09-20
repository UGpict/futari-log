import type { Memory, MemoryCandidate } from "@/domain/schemas";

export function canReadMemory(memory: Memory, nextSessionId: string): boolean {
  if (!memory.active) return false;
  if (memory.scope === "ONGOING") return true;
  return memory.targetSessionId === nextSessionId;
}

export function candidateToMemory(input: {
  candidate: MemoryCandidate;
  approvedAt: string;
  targetSessionId: string | null;
  supersedes?: string | null;
  version?: number;
}): Memory {
  if (input.candidate.sourceType === "HYPOTHESIS") {
    throw new Error("hypothesis cannot be stored as memory");
  }
  const sourceType = input.candidate.sourceType;
  return {
    id: input.candidate.id.replace(/^mc_/, "mem_"),
    coupleId: input.candidate.coupleId,
    subject: input.candidate.subject,
    type: input.candidate.type,
    content: input.candidate.content,
    sourceType,
    reflectionId: input.candidate.reflectionId,
    answerId: input.candidate.answerId ?? "missing",
    evidenceQuote: input.candidate.evidenceQuote,
    confirmation: "USER_CONFIRMED",
    approvedAt: input.approvedAt,
    visibility: "PRIVATE",
    strength: input.candidate.strength,
    scope: input.candidate.scope,
    targetSessionId: input.candidate.scope === "NEXT_DATE" ? input.targetSessionId : null,
    active: true,
    version: input.version ?? 1,
    supersedes: input.supersedes ?? null,
  };
}
