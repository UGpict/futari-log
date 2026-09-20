import {
  DEFAULT_SPOT_SCOUT_JOBS,
  scoutJobsFromWishes,
  type ScoutBucket,
  type SpotScoutJob,
} from "@/contracts/spotKinds";

export type { ScoutBucket };

export type ScoutJob = SpotScoutJob;

export const DEFAULT_SCOUT_JOBS: ScoutJob[] = DEFAULT_SPOT_SCOUT_JOBS;

export function scoutJobsForPreferences(
  preferences: { content: string; priority?: string }[],
): { jobs: ScoutJob[]; unsupported: string[]; key: string } {
  return scoutJobsFromWishes(preferences.map((item) => item.content).join("。"));
}
