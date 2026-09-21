import type { Memory, MemoryCandidate, MemoryPlanDirective } from "@/domain/schemas";

export function canReadMemory(memory: Memory, nextSessionId: string): boolean {
  if (!memory.active) return false;
  if (memory.scope === "ONGOING") return true;
  // NEXT_DATE: 未束縛は次の有効プランに適用可。束縛済みはその session のみ。
  if (memory.targetSessionId == null) return true;
  return memory.targetSessionId === nextSessionId;
}

/** CONFIRMED になったセッションへ NEXT_DATE を束縛する。DRAFT 放棄では呼ばない。 */
export function bindNextDateMemories(
  memories: Record<string, Memory>,
  sessionId: string,
  usedMemoryIds: string[],
): void {
  const used = new Set(usedMemoryIds);
  for (const memory of Object.values(memories)) {
    if (!memory.active) continue;
    if (memory.scope !== "NEXT_DATE") continue;
    if (memory.targetSessionId != null) continue;
    if (!used.has(memory.id)) continue;
    memory.targetSessionId = sessionId;
  }
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
    reflectionVersion: input.candidate.reflectionVersion ?? 1,
    answerId: input.candidate.answerId ?? "missing",
    evidenceQuote: input.candidate.evidenceQuote,
    confirmation: "USER_CONFIRMED",
    approvedAt: input.approvedAt,
    visibility: "PRIVATE",
    strength: input.candidate.strength,
    scope: input.candidate.scope,
    // NEXT_DATE は承認時点では未束縛。適用先セッション確定時に bind する。
    targetSessionId: input.candidate.scope === "NEXT_DATE" ? null : input.targetSessionId,
    planDirectives: input.candidate.planDirectives ?? [],
    active: true,
    version: input.version ?? 1,
    supersedes: input.supersedes ?? null,
  };
}

export function directivesOf(memory: Memory | MemoryCandidate): MemoryPlanDirective[] {
  return memory.planDirectives ?? [];
}

export function hasDirective(
  memory: Memory,
  kind: MemoryPlanDirective["kind"],
): boolean {
  return directivesOf(memory).some((d) => d.kind === kind);
}
