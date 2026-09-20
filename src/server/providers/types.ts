import type { ScenarioOverlay } from "@/domain/schemas";
import type { PlaceHoursRule } from "./placeFacts";

export type ProviderCtx = {
  runId: string;
  overlays: ScenarioOverlay[];
  cache: Map<string, { at: string; value: unknown; stale: boolean }>;
  httpAttempts: number;
  onHttp: (info: { provider: string; cacheHit: boolean; attempt: number }) => void | Promise<void>;
  placeHours?: Record<string, PlaceHoursRule[]>;
};
