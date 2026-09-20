process.env.ENABLE_DEMO_CONTROLS ??= "true";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getEnv } from "../src/config/env";
import { validatePlan } from "../src/domain/plan/validatePlan";
import type { Plan, PlanningInput } from "../src/domain/schemas";
import { getEvent, latestIngestRun, listEvents, saveEvent, saveIngestRun, saveVenue } from "../src/server/catalog/repo";
import { loadSelectedEventSpots } from "../src/server/catalog/planAttach";
import type { CatalogEventRecord, CatalogIngestRunRecord, CatalogVenueRecord } from "../src/server/catalog/repo";

async function syncFileCatalogToFirestore() {
  const file = join(process.cwd(), ".data", "catalog.json");
  if (!existsSync(file)) return 0;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    events?: Record<string, CatalogEventRecord>;
    venues?: Record<string, CatalogVenueRecord>;
    ingestRuns?: Record<string, CatalogIngestRunRecord>;
  };
  let n = 0;
  for (const venue of Object.values(parsed.venues ?? {})) {
    await saveVenue(venue);
    n += 1;
  }
  for (const event of Object.values(parsed.events ?? {})) {
    await saveEvent(event);
    n += 1;
  }
  for (const run of Object.values(parsed.ingestRuns ?? {})) {
    if (run.id === "_lock") continue;
    await saveIngestRun(run);
  }
  return n;
}

async function main() {
  const env = getEnv();
  const synced =
    process.env.SYNC_CATALOG === "1" && env.dataBackend === "firestore"
      ? await syncFileCatalogToFirestore()
      : 0;
  const listed = await listEvents({ genre: "展覧会" });
  const first =
    listed.find(
      (e) =>
        e.planEligible &&
        e.fields.title.confirmation === "VERIFIED" &&
        e.fields.periodStart.confirmation === "VERIFIED" &&
        e.fields.hours.confirmation === "VERIFIED" &&
        e.fields.closedDays.confirmation === "VERIFIED",
    ) ??
    listed.find(
      (e) =>
        e.planEligible &&
        e.fields.title.confirmation === "VERIFIED" &&
        e.fields.periodStart.confirmation === "VERIFIED",
    ) ??
    listed[0];
  const detail = first ? await getEvent(first.id) : null;
  const run = await latestIngestRun();
  const attachedOff = await loadSelectedEventSpots({
    enabled: false,
    selectedEventIds: first ? [first.id] : ["evt_missing"],
    dateTokyo: env.demoDate,
  });
  const attachedOn = await loadSelectedEventSpots({
    enabled: true,
    selectedEventIds: first ? [first.id] : ["evt_missing"],
    dateTokyo: env.demoDate,
  });
  const attachedMissing = await loadSelectedEventSpots({
    enabled: true,
    selectedEventIds: ["evt_does_not_exist"],
    dateTokyo: env.demoDate,
  });
  const attachedSpot = attachedOn.spots[0];
  const planCheck = attachedSpot
    ? validatePlan(sampleStay(attachedSpot.id, env.demoDate), {
        spots: { [attachedSpot.id]: attachedSpot },
        input: sampleInput(env.demoDate),
      })
    : null;
  console.log(
    JSON.stringify(
      {
        dataBackend: env.dataBackend,
        enableEventCatalog: env.enableEventCatalog,
        synced,
        listCount: listed.length,
        verifiedTitleAndPeriod: listed.filter(
          (e) => e.fields.title.confirmation === "VERIFIED" && e.fields.periodStart.confirmation === "VERIFIED" && e.fields.periodEnd.confirmation === "VERIFIED",
        ).length,
        latestRun: run
          ? {
              id: run.id,
              status: run.status,
              saved: run.saved,
              error: run.error,
              search: run.search
                ? {
                    path: run.search.path,
                    grounded: run.search.grounded,
                    citationCount: run.search.citationCount,
                    promptTokens: run.search.promptTokens,
                    completionTokens: run.search.completionTokens,
                    costUsd: run.search.costUsd,
                    costJpy: run.search.costJpy,
                    costSource: run.search.costSource,
                    orcaRequestId: run.search.orcaRequestId,
                    note:
                      run.search.costSource === "missing"
                        ? "検索費用不明。0円としては集計しない"
                        : "costUsd は推論と検索ツールの内訳を分けない。欠測は null",
                  }
                : null,
              structure: run.structure,
            }
          : null,
        detail: detail
          ? {
              id: detail.id,
              title: detail.title,
              confirmation: detail.confirmation,
              fetchedAt: detail.fetchedAt,
              sourceHost: detail.sourceUrl ? safeHost(detail.sourceUrl) : null,
              fields: {
                title: detail.fields.title.confirmation,
                periodStart: detail.fields.periodStart.confirmation,
                periodEnd: detail.fields.periodEnd.confirmation,
                hours: detail.fields.hours.confirmation,
                closedDays: detail.fields.closedDays.confirmation,
                venue: detail.fields.venue.confirmation,
                fee: detail.fields.fee.confirmation,
              },
              planEligible: detail.planEligible,
              eventImageKind: detail.eventImage?.kind ?? null,
              hasPhotoName: JSON.stringify(detail).includes("photoName"),
            }
          : null,
        plan: {
          flagOffSpots: attachedOff.spots.length,
          flagOnSpots: attachedOn.spots.map((s) => ({
            id: s.id,
            kind: s.spotKind,
            window: s.eventWindow?.confirmation ?? null,
            hours: s.eventHours?.confirmation ?? null,
            closed: s.eventClosed?.confirmation ?? null,
          })),
          flagOnFailed: attachedOn.failed,
          flagOnNeedsConfirmation: attachedOn.needsConfirmation,
          missingNeedsConfirmation: attachedMissing.needsConfirmation,
          missingFailed: attachedMissing.failed,
          validationState: planCheck?.state ?? null,
          validationCodes: planCheck?.issues.map((i) => i.code) ?? [],
        },
      },
      null,
      2,
    ),
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

function sampleInput(dateTokyo: string): PlanningInput {
  return {
    dateTokyo,
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.68, lng: 139.76, spotId: null },
    end: { name: "東京駅", lat: 35.68, lng: 139.76, spotId: null },
    budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    preferences: [
      { id: "p1", subject: "PARTNER", content: "展示", priority: "MUST", source: "PARTNER_STATEMENT_REPORTED" },
    ],
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: "WALK",
    areaName: "東京駅周辺",
    areaLat: 35.68,
    areaLng: 139.76,
    radiusMeters: 2500,
  };
}

function sampleStay(spotId: string, dateTokyo: string): Plan {
  const startAt = `${dateTokyo}T13:20:00+09:00`;
  const endAt = `${dateTokyo}T14:10:00+09:00`;
  return {
    version: 1,
    items: [
      {
        id: "i1",
        spotId,
        startAt,
        endAt,
        progress: "NOT_STARTED",
        locked: false,
        lockReason: null,
        matchesPreferenceIds: ["p1"],
        memoryIds: [],
        reason: "展示",
        evidenceIds: [],
      },
    ],
    legs: [
      {
        id: "l1",
        from: "MEET",
        fromSpotId: null,
        to: "SPOT",
        toSpotId: spotId,
        mode: "WALK",
        departureAt: `${dateTokyo}T13:00:00+09:00`,
        durationMinutes: { value: 15, evidenceIds: ["ev-travel"] },
        distanceMeters: { value: 800, evidenceIds: ["ev-travel"] },
        delayMinutesInjected: null,
        evidenceIds: ["ev-travel"],
      },
      {
        id: "l2",
        from: "SPOT",
        fromSpotId: spotId,
        to: "END",
        toSpotId: null,
        mode: "WALK",
        departureAt: endAt,
        durationMinutes: { value: 15, evidenceIds: ["ev-travel"] },
        distanceMeters: { value: 800, evidenceIds: ["ev-travel"] },
        delayMinutesInjected: null,
        evidenceIds: ["ev-travel"],
      },
    ],
    openings: [],
    assumptions: [],
    validation: { state: "PASS", issues: [] },
    planB: [],
    costEstimate: {
      mealsJpy: { value: null, evidenceIds: [] },
      facilitiesJpy: { value: null, evidenceIds: [] },
      transitJpy: { value: null, evidenceIds: [] },
      totalJpy: { value: null, evidenceIds: [] },
    },
    dataMode: "LIVE",
    memoryInfluences: [],
  };
}

void main();
