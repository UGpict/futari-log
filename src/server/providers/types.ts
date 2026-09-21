import type { ScenarioOverlay } from "@/domain/schemas";
import type { PlaceHoursRule, SpotOpeningHours } from "./placeFacts";

export type ProviderCtx = {
  runId: string;
  overlays: ScenarioOverlay[];
  cache: Map<string, { at: string; value: unknown; stale: boolean }>;
  httpAttempts: number;
  onHttp: (info: { provider: string; cacheHit: boolean; attempt: number }) => void | Promise<void>;
  /** spotId → regular + dated。配列のみの旧形も asSpotOpeningHours で受ける。 */
  placeHours?: Record<string, SpotOpeningHours | PlaceHoursRule[]>;
};
