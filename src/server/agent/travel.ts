import { estimateTravel, type ProviderCtx } from "@/server/providers";
import type { TravelMode } from "@/domain/schemas";
import { remember } from "./memory";
import type { AgentLog, AgentMemories } from "./types";

export async function runTravel(input: {
  ctx: ProviderCtx;
  log: AgentLog;
  memories: AgentMemories;
  from: { lat: number; lng: number; spotId?: string | null };
  to: { lat: number; lng: number; spotId?: string | null };
  mode: TravelMode;
  departureAt: string;
}): Promise<{ durationMinutes: number | null; evidenceId: string }> {
  const key = `leg:${input.from.spotId ?? input.from.lat},${input.from.lng}->${input.to.spotId ?? input.to.lat},${input.to.lng}:${input.mode}`;
  const remembered = input.memories.travel?.facts[key] as { durationMinutes?: number | null } | undefined;
  const result = await estimateTravel(input.ctx, {
    from: input.from,
    to: input.to,
    mode: input.mode,
    departureAt: input.departureAt,
  });
  remember(input.memories, "travel", {
    note:
      result.durationMinutes != null
        ? `${Math.round(result.durationMinutes)}分 ${input.mode}`
        : `${input.mode} 未検証`,
    factKey: key,
    factValue: { durationMinutes: result.durationMinutes ?? remembered?.durationMinutes ?? null },
  });
  return { durationMinutes: result.durationMinutes, evidenceId: result.evidence.id };
}

export async function noteTravelPass(input: {
  log: AgentLog;
  memories: AgentMemories;
  unknownCount: number;
}): Promise<void> {
  if (input.unknownCount === 0) {
    await input.log("travel", "TOOL_COMPLETED", "区間の移動時間を確認");
    return;
  }
  remember(input.memories, "travel", {
    note: `未検証 ${input.unknownCount} 区間`,
  });
  await input.log("travel", "TOOL_COMPLETED", `未検証 ${input.unknownCount} 区間は直線距離で埋めない`);
}
