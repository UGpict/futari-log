import { createHash } from "node:crypto";
import { getEnv } from "@/config/env";
import { LIMITS } from "@/config/settings";
import { newId, sha256 } from "@/lib/ids";
import { groundedGoogleSearch } from "@/server/llm/search";
import { confirmField, planEligible, preferVerified, rollupConfirmation } from "./confirm";
import { bodiesMentioning, extractFactsFromPage, parseClosedRule, pickOfficialPage } from "./extract";
import { extractOgImage, fetchPublicHttps } from "./fetchSource";
import { matchVenuePlace } from "./placesVenue";
import {
  releaseIngestLock,
  saveEvent,
  saveIngestRun,
  saveVenue,
  tryAcquireIngestLock,
  type CatalogEventRecord,
  type CatalogIngestRunRecord,
  type CatalogVenueRecord,
} from "./repo";
import { structureEvents } from "./structure";
import { TOKYO_PRIORITY_AREAS } from "@/contracts/serviceArea";
import { tokyoToday, toTokyoParts } from "@/lib/time";

function defaultIngestDateTokyo(): string {
  // 固定 demoDate に依存しない。JST 当日を既定とする。
  return tokyoToday();
}

function defaultIngestArea(): { name: string; lat: number; lng: number } {
  return TOKYO_PRIORITY_AREAS[0];
}

function weekendDatesFrom(today: string): string[] {
  const parts = toTokyoParts(`${today}T12:00:00+09:00`);
  const base = new Date(`${today}T12:00:00+09:00`);
  const dates: string[] = [today];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(base.getTime() + i * 86400_000);
    const p = toTokyoParts(d.toISOString());
    if (p.weekday === 0 || p.weekday === 6) {
      if (!dates.includes(p.date)) dates.push(p.date);
    }
  }
  void parts;
  return dates.slice(0, 3);
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function asDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asTime(value: string | null): string | null {
  if (!value) return null;
  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function venueIdFor(name: string, placeId: string | null): string {
  return `ven_${sha256(placeId ?? normalizeKey(name)).slice(0, 16)}`;
}

export async function ingestEvents(input?: {
  dateTokyo?: string;
  genre?: string;
  areaName?: string;
  owner?: string;
}): Promise<{ ok: boolean; runId: string; status: string; saved: number; error: string | null }> {
  const env = getEnv();
  const area = TOKYO_PRIORITY_AREAS.find((a) => a.name === input?.areaName) ?? defaultIngestArea();
  const dateTokyo = input?.dateTokyo ?? defaultIngestDateTokyo();
  const genre = input?.genre ?? "展覧会";
  const areaName = input?.areaName ?? area.name;
  const owner = input?.owner ?? `ingest-${process.pid}`;
  const runId = newId("ing");
  const startedAt = new Date().toISOString();
  const query = `${areaName} ${dateTokyo} ${genre} 開催 公式`;
  const searchArea = { lat: area.lat, lng: area.lng };
  const relatedDates = weekendDatesFrom(dateTokyo);
  const queryWithWeekend =
    relatedDates.length > 1 ? `${query} （関連 ${relatedDates.slice(1).join(",")}）` : query;

  const lock = await tryAcquireIngestLock({ owner, runId, leaseMs: 180_000 });
  if (!lock.ok) {
    const skipped: CatalogIngestRunRecord = {
      id: runId,
      status: "SKIPPED",
      startedAt,
      finishedAt: new Date().toISOString(),
      leaseOwner: owner,
      leaseExpiresAt: null,
      attempt: 1,
      query: queryWithWeekend,
      areaName,
      dateTokyo,
      genre,
      saved: 0,
      error: `double-run blocked (${lock.reason})`,
      search: null,
      structure: null,
    };
    await saveIngestRun(skipped);
    return { ok: false, runId, status: "SKIPPED", saved: 0, error: skipped.error };
  }

  const run: CatalogIngestRunRecord = {
    id: runId,
    status: "RUNNING",
    startedAt,
    finishedAt: null,
    leaseOwner: owner,
    leaseExpiresAt: new Date(Date.now() + 180_000).toISOString(),
    attempt: 1,
    query: queryWithWeekend,
    areaName,
    dateTokyo,
    genre,
    saved: 0,
    error: null,
    search: null,
    structure: null,
  };
  await saveIngestRun(run);

  try {
    const search = await groundedGoogleSearch({ query: queryWithWeekend, model: env.orcaSearchModel });
    run.search = {
      requestedModel: search.requestedModel,
      actualModel: search.actualModel,
      path: search.path,
      latencyMs: search.latencyMs,
      promptTokens: search.usage.promptTokens,
      completionTokens: search.usage.completionTokens,
      costUsd: search.usage.costUsd,
      costJpy: search.usage.costJpy,
      citationCount: search.citations.length,
      grounded: search.grounded,
      orcaRequestId: search.orcaRequestId,
      costSource: search.costSource,
      retries: search.retries,
      lastStatus: search.lastStatus,
    };
    if (!search.grounded || !search.citations.length) {
      run.status = "FAILED";
      run.error = search.error ?? "search ungrounded";
      run.finishedAt = new Date().toISOString();
      await saveIngestRun(run);
      return { ok: false, runId, status: run.status, saved: 0, error: run.error };
    }

    const bodies = new Map<string, string>();
    const fetchedAt = new Map<string, string>();
    const htmlByUrl = new Map<string, string>();
    const addFetched = async (rawUrl: string | null) => {
      if (!rawUrl || bodies.has(rawUrl)) return;
      const fetched = await fetchPublicHttps(rawUrl);
      if (!fetched.ok || !fetched.text) return;
      const url = fetched.finalUrl ?? rawUrl;
      const at = new Date().toISOString();
      bodies.set(rawUrl, fetched.text);
      bodies.set(url, fetched.text);
      htmlByUrl.set(url, fetched.html);
      fetchedAt.set(rawUrl, at);
      fetchedAt.set(url, at);
    };
    for (const citation of search.citations.slice(0, env.ingestMaxEvents)) {
      await addFetched(citation.url);
    }

    const structured = await structureEvents({
      query: queryWithWeekend,
      searchText: search.text,
      citations: search.citations,
      documents: [...new Map([...bodies.entries()].filter(([url]) => !url.includes("vertexaisearch"))).entries()].map(
        ([url, text]) => ({ url, text }),
      ),
      maxEvents: env.ingestMaxEvents,
    });
    run.structure = {
      requestedModel: structured.usage.requestedModel,
      actualModel: structured.usage.actualModel,
      latencyMs: structured.usage.latencyMs,
      promptTokens: structured.usage.promptTokens,
      completionTokens: structured.usage.completionTokens,
      costUsd: structured.usage.costUsd,
      costJpy: structured.usage.costJpy,
      ok: structured.usage.ok,
      retries: structured.usage.retries,
      lastStatus: structured.usage.lastStatus,
    };
    if (!structured.data?.events.length) {
      run.status = "FAILED";
      run.error = structured.usage.error ?? "structure empty";
      run.finishedAt = new Date().toISOString();
      await saveIngestRun(run);
      return { ok: false, runId, status: run.status, saved: 0, error: run.error };
    }

    let saved = 0;
    for (const raw of structured.data.events.slice(0, LIMITS.ingestMaxEvents)) {
      await addFetched(raw.officialUrl.value);
      const titleHint = raw.title.value && raw.title.value !== "UNKNOWN" ? raw.title.value : null;
      if (!titleHint) continue;
      const scoped = bodiesMentioning(bodies, titleHint);
      if (scoped.size === 0) continue;
      const pageUrl = pickOfficialPage(scoped, raw.officialUrl.value, titleHint);
      const pageText = pageUrl ? scoped.get(pageUrl) ?? bodies.get(pageUrl) : null;
      const pageFacts = pageText && pageUrl
        ? extractFactsFromPage(pageText, pageUrl, fetchedAt.get(pageUrl) ?? new Date().toISOString(), {
            title: titleHint,
            venue: raw.venueName.value,
          })
        : null;

      const title = preferVerified(
        pageFacts?.title ?? { value: null, confirmation: "UNKNOWN", sourceUrl: null, quote: null, fetchedAt: null },
        confirmField(raw.title, scoped, fetchedAt),
      );
      if (!title.value || title.confirmation !== "VERIFIED") continue;
      const venue = preferVerified(
        pageFacts?.venue ?? { value: null, confirmation: "UNKNOWN", sourceUrl: null, quote: null, fetchedAt: null },
        confirmField(raw.venueName, scoped, fetchedAt),
      );
      const periodStart = preferVerified(
        pageFacts?.periodStart ?? { value: null, confirmation: "UNKNOWN", sourceUrl: null, quote: null, fetchedAt: null },
        confirmField(raw.startDate, scoped, fetchedAt),
      );
      const periodEnd = preferVerified(
        pageFacts?.periodEnd ?? { value: null, confirmation: "UNKNOWN", sourceUrl: null, quote: null, fetchedAt: null },
        confirmField(raw.endDate, scoped, fetchedAt),
      );
      const hoursOpen = pageFacts?.hoursOpen ?? confirmField(raw.startTime, scoped, fetchedAt);
      const hoursClose = pageFacts?.hoursClose ?? confirmField(raw.endTime, scoped, fetchedAt);
      const fridayClose = pageFacts?.fridayClose ?? {
        value: null,
        confirmation: "UNKNOWN" as const,
        sourceUrl: null,
        quote: null,
        fetchedAt: null,
      };
      const closedDaysRaw = pageFacts?.closedDays ?? {
        value: null,
        confirmation: "UNKNOWN" as const,
        sourceUrl: null,
        quote: null,
        fetchedAt: null,
      };
      const closedYear = Number((asDate(periodStart.value) ?? dateTokyo).slice(0, 4));
      const closedDays =
        closedDaysRaw.confirmation === "VERIFIED" && parseClosedRule(closedDaysRaw.value, closedYear)
          ? closedDaysRaw
          : { value: null, confirmation: "UNKNOWN" as const, sourceUrl: closedDaysRaw.sourceUrl, quote: closedDaysRaw.quote, fetchedAt: closedDaysRaw.fetchedAt };
      const fee = preferVerified(
        pageFacts?.fee ?? { value: null, confirmation: "UNKNOWN", sourceUrl: null, quote: null, fetchedAt: null },
        confirmField(raw.feeText, scoped, fetchedAt),
      );
      const dateStart = periodStart.confirmation === "VERIFIED" ? asDate(periodStart.value) : null;
      const dateEnd = periodEnd.confirmation === "VERIFIED" ? asDate(periodEnd.value) : null;
      const timeStart = hoursOpen.confirmation === "VERIFIED" ? asTime(hoursOpen.value) : null;
      const timeEnd = hoursClose.confirmation === "VERIFIED" ? asTime(hoursClose.value) : null;
      const hoursField = {
        value: timeStart && timeEnd ? `${timeStart}-${timeEnd}` : null,
        confirmation: hoursOpen.confirmation === "VERIFIED" && hoursClose.confirmation === "VERIFIED"
          ? ("VERIFIED" as const)
          : ("UNKNOWN" as const),
        sourceUrl: hoursOpen.sourceUrl,
        quote: hoursOpen.quote,
        fetchedAt: hoursOpen.fetchedAt,
      };
      const eligible = planEligible({ title, periodStart, periodEnd });
      const fingerprint = createHash("sha256")
        .update(`${normalizeKey(title.value)}|${normalizeKey(venue.value ?? "")}|${dateStart ?? ""}`)
        .digest("hex");
      const eventId = `evt_${fingerprint.slice(0, 16)}`;

      let place = null;
      if (venue.value && env.googleMapsApiKey) {
        place = await matchVenuePlace({
          apiKey: env.googleMapsApiKey,
          name: venue.value,
          area: searchArea,
        }).catch(() => null);
      }
      const venueRecord: CatalogVenueRecord | null = venue.value
        ? {
            id: venueIdFor(venue.value, place?.placeId ?? null),
            name: place?.name ?? venue.value,
            placeId: place?.placeId ?? null,
            lat: place?.lat ?? null,
            lng: place?.lng ?? null,
            types: place?.types ?? [],
            websiteUri: place?.websiteUri ?? null,
            googleMapsUri: place?.googleMapsUri ?? null,
            regularOpeningHours: place?.regularOpeningHours ?? null,
            hoursFetchedAt: place?.hoursFetchedAt ?? null,
            venuePhoto: place?.googleMapsUri
              ? {
                  kind: "VENUE",
                  sourceUrl: null,
                  attribution: "Google",
                  confirmation: "PARTIAL",
                }
              : null,
            fetchedAt: new Date().toISOString(),
            confirmation: venue.confirmation,
          }
        : null;
      if (venueRecord) await saveVenue(venueRecord);

      const sourceUrl = title.sourceUrl ?? periodStart.sourceUrl ?? pageUrl;
      const html = sourceUrl ? htmlByUrl.get(sourceUrl) ?? "" : "";
      const og = html ? extractOgImage(html) : null;
      const event: CatalogEventRecord = {
        id: eventId,
        title: title.value,
        genre,
        venueId: venueRecord?.id ?? null,
        venueName: venueRecord?.name ?? venue.value,
        dateStart,
        dateEnd,
        timeStart,
        timeEnd,
        feeText: fee.confirmation === "VERIFIED" ? fee.value : null,
        officialUrl: raw.officialUrl.value ?? sourceUrl,
        lat: venueRecord?.lat ?? null,
        lng: venueRecord?.lng ?? null,
        confirmation: rollupConfirmation([title, periodStart, periodEnd, hoursField, closedDays, venue, fee]),
        sourceUrl,
        sourceTitle: sourceUrl,
        fetchedAt: new Date().toISOString(),
        planEligible: eligible,
        fields: {
          title,
          periodStart,
          periodEnd,
          hours: hoursField,
          fridayClose,
          closedDays,
          venue,
          fee,
        },
        eventImage: og
          ? { kind: "EVENT", sourceUrl: og, attribution: null, confirmation: "PARTIAL" }
          : null,
        areaName,
        ingestRunId: runId,
        fingerprint,
      };
      await saveEvent(event);
      saved += 1;
    }

    run.saved = saved;
    run.status = saved > 0 ? "SUCCEEDED" : "FAILED";
    run.error = saved > 0 ? null : "no events confirmed enough to save";
    run.finishedAt = new Date().toISOString();
    await saveIngestRun(run);
    return { ok: saved > 0, runId, status: run.status, saved, error: run.error };
  } catch (error) {
    run.status = "FAILED";
    run.error = error instanceof Error ? error.message : "ingest failed";
    run.finishedAt = new Date().toISOString();
    await saveIngestRun(run);
    return { ok: false, runId, status: run.status, saved: 0, error: run.error };
  } finally {
    await releaseIngestLock(runId);
  }
}

export async function ingestTokyoPriority(input?: {
  dateTokyo?: string;
  genre?: string;
}): Promise<{ areaName: string; ok: boolean; runId: string; saved: number; error: string | null }[]> {
  const results = [];
  for (const area of TOKYO_PRIORITY_AREAS) {
    const result = await ingestEvents({
      dateTokyo: input?.dateTokyo,
      genre: input?.genre ?? "展覧会",
      areaName: area.name,
      owner: `tokyo-priority-${area.name}`,
    });
    results.push({
      areaName: area.name,
      ok: result.ok,
      runId: result.runId,
      saved: result.saved,
      error: result.error,
    });
  }
  return results;
}
