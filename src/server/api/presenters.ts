import { sessionSnapshotSchema, type SessionSnapshot } from "@/contracts/session";
import { runViewSchema, type RunView } from "@/contracts/session";
import { meResponseSchema, type MeResponse } from "@/contracts/me";
import { memoryListResponseSchema, type MemoryListResponse } from "@/contracts/memory";
import { replayResponseSchema, type ReplayResponse } from "@/contracts/replay";
import {
  catalogEventDetailSchema,
  catalogEventListResponseSchema,
  catalogVenueDetailSchema,
  type CatalogEventDetail,
  type CatalogEventListResponse,
  type CatalogVenueDetail,
} from "@/contracts/catalog";

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

export function presentCatalogList(raw: unknown): CatalogEventListResponse {
  return catalogEventListResponseSchema.parse(raw);
}

export function presentCatalogEvent(raw: unknown): CatalogEventDetail {
  return catalogEventDetailSchema.parse(raw);
}

export function presentCatalogVenue(raw: unknown): CatalogVenueDetail {
  return catalogVenueDetailSchema.parse(raw);
}
