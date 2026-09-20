import { estimateTravel, type ProviderCtx } from "@/server/providers";
import type { TravelMode } from "@/domain/schemas";
import type { AgentLog, AgentMemories } from "./types";

export async function runTravel(input: {
  ctx: ProviderCtx;
  log: AgentLog;
  memories: AgentMemories;
  from: { lat: number; lng: number; spotId?: string | null };
  to: { lat: number; lng: number; spotId?: string | null };
  mode: TravelMode;
  departureAt: string;
}): Promise<{ durationMinutes: number | null; bufferMinutes: number; evidenceId: string }> {
  void input.memories;
  const result = await estimateTravel(input.ctx, {
    from: input.from,
    to: input.to,
    mode: input.mode,
    departureAt: input.departureAt,
  });
  return { durationMinutes: result.durationMinutes, bufferMinutes: result.bufferMinutes, evidenceId: result.evidence.id };
}

export async function noteTravelPass(input: {
  log: AgentLog;
  memories: AgentMemories;
  unknownCount: number;
}): Promise<void> {
  void input.memories;
  if (input.unknownCount === 0) {
    await input.log("travel", "TOOL_COMPLETED", "区間の移動時間を確認");
    return;
  }
  await input.log("travel", "TOOL_COMPLETED", `未検証 ${input.unknownCount} 区間は直線距離で埋めない`);
}
