import { sessionSnapshotSchema, type SessionSnapshot } from "@/contracts/session";
import { runViewSchema, type RunView } from "@/contracts/session";
import { meResponseSchema, type MeResponse } from "@/contracts/me";
import { memoryListResponseSchema, type MemoryListResponse } from "@/contracts/memory";
import { replayResponseSchema, type ReplayResponse } from "@/contracts/replay";

export function presentSessionSnapshot(raw: unknown): SessionSnapshot {
  return sessionSnapshotSchema.parse(raw);
}

export function presentRunView(raw: unknown): RunView {
  return runViewSchema.parse(raw);
}

export function presentMe(raw: unknown): MeResponse {
  return meResponseSchema.parse(raw);
}

export function presentMemoryList(raw: unknown): MemoryListResponse {
  return memoryListResponseSchema.parse(raw);
}

export function presentReplay(raw: unknown): ReplayResponse {
  return replayResponseSchema.parse(raw);
}
