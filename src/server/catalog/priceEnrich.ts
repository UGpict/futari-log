import { getEnv } from "@/config/env";
import type { OfficialPriceFact, PriceEnrichRun, PriceEvidence } from "@/contracts/price";
import { newId } from "@/lib/ids";
import { groundedGoogleSearch } from "@/server/llm/search";
import { fetchPublicHttps } from "./fetchSource";
import {
  listFactsForPlace,
  releasePriceLock,
  saveEnrichRun,
  saveEvidence,
  saveFact,
  stableFactId,
  tryAcquirePriceLock,
} from "./priceRepo";

const MAX_SEARCH = 2;
const MAX_PAGES = 4;
const MAX_MS = 90_000;

export type PriceEnrichInput = {
  placeId: string;
  venueName: string;
  address?: string | null;
  websiteUri?: string | null;
  reason?: string;
  owner?: string;
};

function revalidateBy(fetchedAt: string): string {
  const d = new Date(fetchedAt);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

/** 本文から一般入場・入園・メニューっぽい円額を抜き出す（要約だけでは VERIFIED にしない）。 */
export function extractPriceCandidatesFromText(
  text: string,
  sourceUrl: string,
): Omit<OfficialPriceFact, "id" | "placeId" | "venueName" | "fetchedAt" | "evidenceIds" | "branchMatch">[] {
  const out: Omit<
    OfficialPriceFact,
    "id" | "placeId" | "venueName" | "fetchedAt" | "evidenceIds" | "branchMatch"
  >[] = [];
  const body = text.replace(/\s+/g, " ");

  const admission =
    /(?:一般|大人)[^\d]{0,12}(?:料金|入場料|入園料)?[^\d]{0,8}(\d{3,5})\s*円/.exec(body) ??
    /入場料[^\d]{0,8}(\d{3,5})\s*円/.exec(body) ??
    /入園料[^\d]{0,8}(\d{3,5})\s*円/.exec(body);
  if (admission?.[1]) {
    const yen = Number(admission[1]);
    const isGarden = /入園/.test(admission[0]);
    const isSpecial = /企画|特別展|展覧会/.test(body.slice(Math.max(0, admission.index! - 40), admission.index! + 40));
    out.push({
      kind: isSpecial ? "SPECIAL_EXHIBITION" : "ADMISSION",
      amountMinJpy: yen,
      amountMaxJpy: yen,
      maxInclusive: true,
      currency: "JPY",
      unit: "PER_PERSON",
      audience: "GENERAL",
      usageKind: isSpecial ? "SPECIAL_EXHIBITION" : isGarden ? "GARDEN" : "PERMANENT",
      weekdays: [],
      timeStart: null,
      timeEnd: null,
      dateStart: null,
      dateEnd: null,
      exclusionNote: null,
      tax: "UNKNOWN",
      extraFeesUnknown: true,
      confirmation: "PARTIAL",
      sourceUrl,
      quote: admission[0].slice(0, 120),
      revalidateBy: null,
    });
  }

  const menuRe =
    /([ぁ-んァ-ン一-龥A-Za-z]{2,20})[^\d]{0,6}(\d{3,5})\s*円/g;
  let m: RegExpExecArray | null;
  let menuCount = 0;
  while ((m = menuRe.exec(body)) && menuCount < 8) {
    const name = m[1] ?? "";
    const yen = Number(m[2]);
    if (!/ドリンク|コーヒー|ケーキ|スイーツ|パフェ|紅茶|お茶|ラテ|メニュー/.test(name + body.slice(m.index, m.index + 30))) {
      continue;
    }
    menuCount += 1;
    out.push({
      kind: "MENU_ITEM",
      amountMinJpy: yen,
      amountMaxJpy: yen,
      maxInclusive: true,
      currency: "JPY",
      unit: "PER_ITEM",
      audience: "GENERAL",
      usageKind: "DINING",
      weekdays: /平日/.test(body.slice(Math.max(0, m.index - 20), m.index + 20)) ? [1, 2, 3, 4, 5] : [],
      timeStart: null,
      timeEnd: null,
      dateStart: null,
      dateEnd: null,
      exclusionNote: /平日限定/.test(body.slice(Math.max(0, m.index - 30), m.index + 30))
        ? "平日限定の可能性"
        : null,
      tax: "UNKNOWN",
      extraFeesUnknown: true,
      confirmation: "PARTIAL",
      sourceUrl,
      quote: m[0].slice(0, 120),
      revalidateBy: null,
    });
  }
  return out;
}

function quoteInBody(body: string, quote: string | null): boolean {
  if (!quote) return false;
  const norm = (s: string) => s.replace(/\s+/g, "");
  return norm(body).includes(norm(quote).slice(0, 24));
}

function branchMatch(
  input: PriceEnrichInput,
  pageUrl: string,
  body: string,
): OfficialPriceFact["branchMatch"] {
  if (input.websiteUri && pageUrl.startsWith(new URL(input.websiteUri).origin)) return "OFFICIAL_URL";
  if (input.placeId && body.includes(input.placeId)) return "PLACE_ID";
  if (input.address && body.includes(input.address.slice(0, 8))) return "ADDRESS";
  if (body.includes(input.venueName)) return "NAME_ONLY";
  return "UNCONFIRMED";
}

export async function enrichSpotPrice(
  input: PriceEnrichInput,
): Promise<{
  ok: boolean;
  runId: string;
  status: PriceEnrichRun["status"];
  factsSaved: number;
  error: string | null;
  costUsd: number | null;
}> {
  const env = getEnv();
  const owner = input.owner ?? `price-${process.pid}`;
  const runId = newId("pen");
  const startedAt = new Date().toISOString();
  const run: PriceEnrichRun = {
    id: runId,
    placeId: input.placeId,
    venueName: input.venueName,
    status: "RUNNING",
    reason: input.reason ?? "cost_missing",
    startedAt,
    finishedAt: null,
    model: null,
    searchCount: 0,
    pagesFetched: 0,
    factsSaved: 0,
    costUsd: null,
    costJpy: null,
    stopReason: null,
    error: null,
    citationUrls: [],
  };
  await saveEnrichRun(run);

  const locked = await tryAcquirePriceLock(input.placeId, owner);
  if (!locked) {
    run.status = "SKIPPED_DUPLICATE";
    run.finishedAt = new Date().toISOString();
    run.stopReason = "lock_held";
    await saveEnrichRun(run);
    return { ok: true, runId, status: run.status, factsSaved: 0, error: null, costUsd: run.costUsd };
  }

  const deadline = Date.now() + MAX_MS;
  try {
    if (!env.orcaApiKey) {
      run.status = "FAILED";
      run.error = "ORCAROUTER_API_KEY missing";
      run.finishedAt = new Date().toISOString();
      await saveEnrichRun(run);
      return { ok: false, runId, status: run.status, factsSaved: 0, error: run.error, costUsd: run.costUsd };
    }

    const publicBits = [input.venueName, input.address, input.placeId, "料金 公式"]
      .filter(Boolean)
      .join(" ");
    // PRIVATE メモリ・振り返りは入れない。
    const search = await groundedGoogleSearch({
      query: publicBits,
      model: env.orcaSearchModel,
    });
    run.searchCount += 1;
    run.model = search.actualModel;
    run.costUsd = (run.costUsd ?? 0) + (search.usage.costUsd ?? 0);
    run.costJpy = (run.costJpy ?? 0) + (search.usage.costJpy ?? 0);
    run.citationUrls = search.citations.map((c) => c.url).slice(0, 12);

    const urls: string[] = [];
    if (input.websiteUri) urls.push(input.websiteUri);
    for (const c of search.citations) {
      if (urls.length >= MAX_PAGES) break;
      if (!urls.includes(c.url)) urls.push(c.url);
    }

    let factsSaved = 0;
    for (const url of urls) {
      if (Date.now() > deadline || run.pagesFetched >= MAX_PAGES) {
        run.stopReason = Date.now() > deadline ? "time_limit" : "page_limit";
        break;
      }
      if (run.searchCount > MAX_SEARCH && run.pagesFetched === 0) break;
      const page = await fetchPublicHttps(url);
      run.pagesFetched += 1;
      if (!page.ok || !page.text) continue;

      const match = branchMatch(input, page.finalUrl ?? url, page.text);
      if (match === "UNCONFIRMED" || match === "NAME_ONLY") {
        // 同名別店の流用を避ける。公式 URL / 住所 / Place ID が無い NAME_ONLY は保存しない。
        if (match === "UNCONFIRMED") continue;
        if (!input.websiteUri && !input.address) continue;
      }

      const evId = newId("pev");
      const evidence: PriceEvidence = {
        id: evId,
        placeId: input.placeId,
        sourceUrl: page.finalUrl ?? url,
        quote: null,
        fetchedAt: new Date().toISOString(),
        bytes: page.bytes,
        contentType: page.contentType,
        note: `branch=${match}`,
      };
      await saveEvidence(evidence);

      const candidates = extractPriceCandidatesFromText(page.text, page.finalUrl ?? url);
      for (const c of candidates) {
        if (!quoteInBody(page.text, c.quote)) continue;
        const confirmation =
          match === "OFFICIAL_URL" || match === "PLACE_ID" || match === "ADDRESS"
            ? c.confirmation === "PARTIAL"
              ? "PARTIAL"
              : "VERIFIED"
            : "UNKNOWN";
        // 要約一致だけでは VERIFIED にしない。本文照合済みでも支店弱いなら UNKNOWN。
        const id = stableFactId({
          placeId: input.placeId,
          kind: c.kind,
          unit: c.unit,
          audience: c.audience,
          usageKind: c.usageKind,
          sourceUrl: c.sourceUrl,
        });
        const existing = (await listFactsForPlace(input.placeId)).find((f) => f.id === id);
        if (existing && existing.confirmation === "VERIFIED" && confirmation !== "VERIFIED") {
          // 取得失敗・弱い根拠で既存 VERIFIED を消さない／格下げしない。
          continue;
        }
        const fact: OfficialPriceFact = {
          ...c,
          id,
          placeId: input.placeId,
          venueName: input.venueName,
          fetchedAt: evidence.fetchedAt,
          revalidateBy: revalidateBy(evidence.fetchedAt),
          evidenceIds: [evId],
          branchMatch: match,
          confirmation: confirmation === "UNKNOWN" ? "UNKNOWN" : confirmation,
        };
        // 人数未確認の Places 帯を確認済みへ格上げしない（ここでは作らない）。
        await saveFact(fact);
        factsSaved += 1;
      }
    }

    if (run.searchCount < MAX_SEARCH && factsSaved === 0 && Date.now() < deadline) {
      const retry = await groundedGoogleSearch({
        query: `${input.venueName} 入場料 OR メニュー 料金 公式サイト`,
        model: env.orcaSearchModel,
      });
      run.searchCount += 1;
      run.costUsd = (run.costUsd ?? 0) + (retry.usage.costUsd ?? 0);
      run.costJpy = (run.costJpy ?? 0) + (retry.usage.costJpy ?? 0);
    }

    run.factsSaved = factsSaved;
    run.status = factsSaved > 0 ? "SUCCEEDED" : "FAILED";
    run.error = factsSaved > 0 ? null : "no_verified_or_partial_facts";
    run.finishedAt = new Date().toISOString();
    if (!run.stopReason && factsSaved === 0) run.stopReason = "not_found";
    await saveEnrichRun(run);
    return {
      ok: factsSaved > 0,
      runId,
      status: run.status,
      factsSaved,
      error: run.error,
      costUsd: run.costUsd,
    };
  } catch (error) {
    run.status = "FAILED";
    run.error = error instanceof Error ? error.message : "price enrich failed";
    run.finishedAt = new Date().toISOString();
    await saveEnrichRun(run);
    return { ok: false, runId, status: run.status, factsSaved: 0, error: run.error, costUsd: run.costUsd };
  } finally {
    await releasePriceLock(input.placeId, owner);
  }
}
