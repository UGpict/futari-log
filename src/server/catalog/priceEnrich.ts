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
const MAX_SAME_ORIGIN_LINKS = 3;

/** カンマ区切り・素の3〜5桁の円額。 */
const YEN_NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d{3,5})`;

export type PriceEnrichInput = {
  placeId: string;
  venueName: string;
  address?: string | null;
  websiteUri?: string | null;
  reason?: string;
  owner?: string;
};

type PriceCandidate = Omit<
  OfficialPriceFact,
  "id" | "placeId" | "venueName" | "fetchedAt" | "evidenceIds" | "branchMatch"
>;

function revalidateBy(fetchedAt: string): string {
  const d = new Date(fetchedAt);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}

/** 全角数字・全角カンマ・¥ を半角に揃える。 */
export function normalizeYenText(text: string): string {
  return text
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ",")
    .replace(/[￥¥]/g, "");
}

export function parseYenCapture(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 100) return null;
  return n;
}

/** 直前が + / プラス / 追加 の追加料金は除外する。 */
function isAddonAmount(body: string, matchIndex: number, matchText = ""): boolean {
  const before = body.slice(Math.max(0, matchIndex - 12), matchIndex);
  if (/(?:\+|＋|プラス|追加)\s*$/.test(before)) return true;
  // 「セット +300円」「飲み放題 +1,650円」のようにラベルと金額の間にある場合。
  if (/(?:\+|＋|プラス|追加)\s*[\d,]/.test(matchText)) return true;
  return false;
}

function pushCandidate(out: PriceCandidate[], row: PriceCandidate) {
  // SET_MENU / ADMISSION は同額を1件に。MENU_ITEM は quote も見て別品を残す。
  const key =
    row.kind === "MENU_ITEM"
      ? `${row.kind}:${row.unit}:${row.usageKind}:${row.amountMinJpy}:${row.quote?.slice(0, 40)}`
      : `${row.kind}:${row.unit}:${row.usageKind}:${row.amountMinJpy}`;
  if (
    out.some((item) => {
      const itemKey =
        item.kind === "MENU_ITEM"
          ? `${item.kind}:${item.unit}:${item.usageKind}:${item.amountMinJpy}:${item.quote?.slice(0, 40)}`
          : `${item.kind}:${item.unit}:${item.usageKind}:${item.amountMinJpy}`;
      return itemKey === key;
    })
  ) {
    return;
  }
  out.push(row);
}

function baseDining(
  partial: Partial<PriceCandidate> & {
    kind: PriceCandidate["kind"];
    amountMinJpy: number;
    quote: string;
    sourceUrl: string;
    unit: PriceCandidate["unit"];
  },
): PriceCandidate {
  const yen = partial.amountMinJpy;
  return {
    kind: partial.kind,
    amountMinJpy: yen,
    amountMaxJpy: partial.amountMaxJpy ?? yen,
    // 飲食のヒューリスティック単価は予算上限に使わない。
    maxInclusive: false,
    currency: "JPY",
    unit: partial.unit,
    audience: "GENERAL",
    usageKind: "DINING",
    weekdays: partial.weekdays ?? [],
    timeStart: null,
    timeEnd: null,
    dateStart: null,
    dateEnd: null,
    exclusionNote: partial.exclusionNote ?? null,
    tax: partial.tax ?? "UNKNOWN",
    extraFeesUnknown: true,
    confirmation: "PARTIAL",
    sourceUrl: partial.sourceUrl,
    quote: partial.quote.slice(0, 120),
    revalidateBy: null,
  };
}

/** 本文から一般入場・入園・メニューっぽい円額を抜き出す（要約だけでは VERIFIED にしない）。 */
export function extractPriceCandidatesFromText(
  text: string,
  sourceUrl: string,
): PriceCandidate[] {
  const out: PriceCandidate[] = [];
  const body = normalizeYenText(text).replace(/\s+/g, " ");

  const admission =
    new RegExp(String.raw`(?:一般|大人)[^\d]{0,12}(?:料金|入場料|入園料)?[^\d]{0,8}${YEN_NUM}\s*円`).exec(body) ??
    new RegExp(String.raw`入場料[^\d]{0,8}${YEN_NUM}\s*円`).exec(body) ??
    new RegExp(String.raw`入園料[^\d]{0,8}${YEN_NUM}\s*円`).exec(body) ??
    new RegExp(String.raw`(?:一般|大人)[^\d]{0,12}税込\s*${YEN_NUM}\s*円`).exec(body);
  if (admission?.[1] && !isAddonAmount(body, admission.index ?? 0, admission[0])) {
    const yen = parseYenCapture(admission[1]);
    if (yen != null) {
      const isGarden = /入園/.test(admission[0]);
      const isSpecial = /企画|特別展|展覧会/.test(
        body.slice(Math.max(0, admission.index! - 40), admission.index! + 40),
      );
      pushCandidate(out, {
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
        tax: /税込/.test(admission[0]) ? "INCLUDED" : "UNKNOWN",
        extraFeesUnknown: true,
        confirmation: "PARTIAL",
        sourceUrl,
        quote: admission[0].slice(0, 120),
        revalidateBy: null,
      });
    }
  }

  const setPatterns: { re: RegExp; label: string }[] = [
    { re: new RegExp(String.raw`飲み放題[^\d]{0,12}${YEN_NUM}\s*円(?:\s*[（(]税込[）)])?`, "g"), label: "飲み放題" },
    { re: new RegExp(String.raw`コース[^\d]{0,12}${YEN_NUM}\s*円(?:\s*[（(]税込[）)])?`, "g"), label: "コース" },
    { re: new RegExp(String.raw`セット[^\d]{0,12}${YEN_NUM}\s*円(?:\s*[（(]税込[）)])?`, "g"), label: "セット" },
    { re: new RegExp(String.raw`ランチ[^\d]{0,12}${YEN_NUM}\s*円(?:\s*[（(]税込[）)])?`, "g"), label: "ランチ" },
    { re: new RegExp(String.raw`${YEN_NUM}\s*円\s*[（(]税込[）)]`, "g"), label: "税込" },
    { re: new RegExp(String.raw`税込\s*${YEN_NUM}\s*円`, "g"), label: "税込" },
  ];
  for (const { re, label } of setPatterns) {
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(body)) && count < 4) {
      if (isAddonAmount(body, m.index, m[0])) continue;
      const yen = parseYenCapture(m[1]);
      if (yen == null) continue;
      // 同一文脈のみ見る（前の文の「駐車場」で後続メニューを落とさない）。
      const nearby = body.slice(Math.max(0, m.index - 16), m.index + m[0].length);
      if (/駐車|コインパーキング|駐輪|ロッカー|郵便/.test(nearby)) continue;
      count += 1;
      const taxIncluded = /税込/.test(m[0]);
      const isNomihodai = label === "飲み放題" || /飲み放題/.test(m[0]);
      const isCourse =
        !isNomihodai &&
        (/コース|セット|ランチ/.test(m[0] + nearby) || ["コース", "セット", "ランチ"].includes(label));
      const uniform =
        label === "税込" && /グランドメニュー|一律|全品|全メニュー/.test(nearby);
      const quoteBase = m[0] + (uniform ? " グランドメニュー" : "");
      pushCandidate(
        out,
        baseDining({
          // 飲み放題はコースと分け、一人あたりの飲み放題単価として残す。
          kind: isCourse || isNomihodai ? "SET_MENU" : "MENU_ITEM",
          unit: isCourse || isNomihodai ? "PER_PERSON" : "PER_ITEM",
          amountMinJpy: yen,
          amountMaxJpy: yen,
          sourceUrl,
          quote: (isNomihodai ? `${quoteBase} 飲み放題` : quoteBase).slice(0, 120),
          tax: taxIncluded ? "INCLUDED" : "UNKNOWN",
        }),
      );
    }
  }

  const menuRe = new RegExp(
    String.raw`([ぁ-んァ-ン一-龥A-Za-z]{2,20})[^\d]{0,6}${YEN_NUM}\s*円(?:\s*[（(]税込[）)])?`,
    "g",
  );
  let m: RegExpExecArray | null;
  let menuCount = 0;
  while ((m = menuRe.exec(body)) && menuCount < 8) {
    if (isAddonAmount(body, m.index, m[0])) continue;
    const name = m[1] ?? "";
    const yen = parseYenCapture(m[2]);
    if (yen == null) continue;
    const before = body.slice(Math.max(0, m.index - 20), m.index);
    const local = `${before}${name}${m[0]}`;
    if (/駐車|コインパーキング|駐輪|ロッカー|郵便/.test(local)) continue;
    if (
      !/ドリンク|コーヒー|ケーキ|スイーツ|パフェ|紅茶|お茶|ラテ|メニュー|ビール|日本酒|ハイボール|焼き鳥|刺身|定食/.test(
        local,
      )
    ) {
      continue;
    }
    menuCount += 1;
    pushCandidate(
      out,
      baseDining({
        kind: "MENU_ITEM",
        unit: "PER_ITEM",
        amountMinJpy: yen,
        amountMaxJpy: yen,
        sourceUrl,
        quote: m[0],
        weekdays: /平日/.test(body.slice(Math.max(0, m.index - 20), m.index + 20)) ? [1, 2, 3, 4, 5] : [],
        exclusionNote: /平日限定/.test(body.slice(Math.max(0, m.index - 30), m.index + 30))
          ? "平日限定の可能性"
          : null,
        tax: /税込/.test(m[0]) ? "INCLUDED" : "UNKNOWN",
      }),
    );
  }
  return out;
}

/** 同一オリジンの料金・メニューっぽいリンクを本文 HTML から拾う。 */
export function extractSameOriginFeeLinks(html: string, pageUrl: string, limit = MAX_SAME_ORIGIN_LINKS): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  // hours|visit|開館 は営業時間ページに枠を食いやすいのでパス判定から外す。
  const feePath =
    /料金|入場|チケット|観覧|menu|price|fee|ticket|admission|ryokin|museum-info/;
  const feeLabel = /料金|入場|チケット|メニュー|料金表|観覧料|観覧|開館時間|price|menu|fee|admission/i;
  const out: string[] = [];
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) && out.length < limit) {
    const attrs = m[1] ?? "";
    const label = (m[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const hrefM = /href\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const raw = hrefM?.[1]?.trim();
    if (!raw || raw.startsWith("#") || raw.toLowerCase().startsWith("javascript:")) continue;
    let abs: URL;
    try {
      abs = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    if (abs.protocol !== "https:") continue;
    let pathDecoded = abs.pathname;
    try {
      pathDecoded = decodeURIComponent(abs.pathname);
    } catch {
      /* keep raw */
    }
    const blob = `${abs.pathname}${abs.search}${pathDecoded}${raw}${label}`.toLowerCase();
    if (!feePath.test(blob) && !feeLabel.test(label) && !feeLabel.test(raw)) continue;
    const href = abs.toString();
    if (!out.includes(href) && href !== pageUrl) out.push(href);
  }
  return out;
}

function quoteInBody(body: string, quote: string | null): boolean {
  if (!quote) return false;
  const norm = (s: string) => normalizeYenText(s).replace(/\s+/g, "");
  return norm(body).includes(norm(quote).slice(0, 24));
}

/** 共有ドメインの別施設価格を避ける。店名の短い核が引用付近にあること。 */
export function venueNearQuote(body: string, quote: string | null, venueName: string): boolean {
  if (!quote || !venueName) return false;
  const normBody = normalizeYenText(body).replace(/\s+/g, " ");
  const normQuote = normalizeYenText(quote).replace(/\s+/g, " ").slice(0, 40);
  const idx = normBody.indexOf(normQuote.slice(0, Math.min(24, normQuote.length)));
  if (idx < 0) return false;
  const window = normBody.slice(Math.max(0, idx - 160), idx + normQuote.length + 160);
  const core = venueName.replace(/\s+/g, "").slice(0, 4);
  if (core.length >= 2 && window.replace(/\s+/g, "").includes(core)) return true;
  const compact = venueName.replace(/(公園|庭園|美術館|博物館|店|カフェ|食堂)$/g, "").slice(0, 4);
  return compact.length >= 2 && window.replace(/\s+/g, "").includes(compact);
}

function pathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/**
 * 公式サイト単館（パスがほぼ /）は origin 全体を信頼。
 * パス付き公式 URL（例: /park/kiyosumi/）はその配下だけ信頼（セグメント完全一致）。
 */
export function officialPageTrusted(websiteUri: string | null | undefined, pageUrl: string): boolean {
  if (!websiteUri) return false;
  try {
    const site = new URL(websiteUri);
    const page = new URL(pageUrl);
    if (site.origin !== page.origin) return false;
    const fileTrimmed = site.pathname.replace(/\/[^/]+\.[a-z0-9]+$/i, "/");
    const basePath = fileTrimmed.replace(/\/+$/, "") || "";
    if (basePath.length <= 1) return true;
    const siteSegs = pathSegments(basePath);
    const pageSegs = pathSegments(page.pathname);
    if (siteSegs.length === 0) return true;
    return siteSegs.every((seg, i) => pageSegs[i] === seg);
  } catch {
    return false;
  }
}

function branchMatch(
  input: PriceEnrichInput,
  pageUrl: string,
  body: string,
): OfficialPriceFact["branchMatch"] {
  try {
    if (input.websiteUri) {
      const siteOrigin = new URL(input.websiteUri).origin;
      const pageOrigin = new URL(pageUrl).origin;
      // startsWith(origin) は example.com.evil.jp に誤ヒットするため origin 完全一致。
      if (pageOrigin === siteOrigin) return "OFFICIAL_URL";
    }
  } catch {
    /* ignore bad websiteUri */
  }
  if (input.placeId && body.includes(input.placeId)) return "PLACE_ID";
  if (input.address && body.includes(input.address.slice(0, 8))) return "ADDRESS";
  if (body.includes(input.venueName)) return "NAME_ONLY";
  return "UNCONFIRMED";
}

function enqueueUrl(urls: string[], url: string, max = MAX_PAGES * 2) {
  if (!url || urls.includes(url) || urls.length >= max) return;
  urls.push(url);
}

/** 公式サイトから辿った料金ページを、検索 citation より先に処理する。 */
function enqueueUrlNext(urls: string[], url: string, afterIndex: number, max = MAX_PAGES * 2) {
  if (!url || urls.includes(url) || urls.length >= max) return;
  const insertAt = Math.min(afterIndex + 1, urls.length);
  urls.splice(insertAt, 0, url);
}

function isFacilityKind(kind: OfficialPriceFact["kind"]): boolean {
  return kind === "ADMISSION" || kind === "SPECIAL_EXHIBITION";
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

    const urls: string[] = [];
    if (input.websiteUri) enqueueUrl(urls, input.websiteUri);
    let cursor = 0;
    let factsSaved = 0;

    const pagesRemaining = () => Math.max(0, MAX_PAGES - run.pagesFetched);

    const processQueuedPages = async () => {
      while (cursor < urls.length) {
        if (Date.now() > deadline || run.pagesFetched >= MAX_PAGES) {
          run.stopReason = Date.now() > deadline ? "time_limit" : "page_limit";
          break;
        }
        const url = urls[cursor]!;
        cursor += 1;
        const page = await fetchPublicHttps(url);
        run.pagesFetched += 1;
        if (!page.ok || !page.text) continue;

        const pageUrl = page.finalUrl ?? url;
        const match = branchMatch(input, pageUrl, page.text);
        // 同名別店の流用を避ける。NAME_ONLY / UNCONFIRMED は保存しない。
        if (match === "UNCONFIRMED" || match === "NAME_ONLY") continue;

        let insertAfter = cursor - 1;
        for (const link of extractSameOriginFeeLinks(page.html || page.text, pageUrl)) {
          const before = urls.length;
          enqueueUrlNext(urls, link, insertAfter);
          if (urls.length > before) insertAfter += 1;
        }

        const evId = newId("pev");
        const evidence: PriceEvidence = {
          id: evId,
          placeId: input.placeId,
          sourceUrl: pageUrl,
          quote: null,
          fetchedAt: new Date().toISOString(),
          bytes: page.bytes,
          contentType: page.contentType,
          note: `branch=${match}`,
        };
        await saveEvidence(evidence);

        const candidates = extractPriceCandidatesFromText(page.text, pageUrl);
        for (const c of candidates) {
          if (!quoteInBody(page.text, c.quote)) continue;

          const trustedOfficial = match === "OFFICIAL_URL" && officialPageTrusted(input.websiteUri, pageUrl);
          // 共有ドメイン上の別施設・別店価格を落とす（施設・飲食とも）。
          if (!trustedOfficial && !venueNearQuote(page.text, c.quote, input.venueName)) {
            // ADDRESS / PLACE_ID はページ単位の一致があるので許容。
            if (match !== "PLACE_ID" && match !== "ADDRESS") continue;
          }

          // VERIFIED は公式 origin 完全一致かつ施設系のみ。飲食ヒューリスティックは PARTIAL。
          const confirmation: OfficialPriceFact["confirmation"] =
            trustedOfficial && isFacilityKind(c.kind) ? "VERIFIED" : "PARTIAL";

          const id = stableFactId({
            placeId: input.placeId,
            kind: c.kind,
            unit: c.unit,
            audience: c.audience,
            usageKind: c.usageKind,
            sourceUrl: c.sourceUrl,
            amountMinJpy: c.amountMinJpy,
            quote: c.quote,
          });
          const existing = (await listFactsForPlace(input.placeId)).find((f) => f.id === id);
          if (existing && existing.confirmation === "VERIFIED" && confirmation !== "VERIFIED") {
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
            confirmation,
          };
          await saveFact(fact);
          factsSaved += 1;
        }
      }
    };

    const runSearch = async (query: string) => {
      if (run.searchCount >= MAX_SEARCH || Date.now() > deadline) return;
      // ページ枠が残っていないときは有料検索しない。
      if (pagesRemaining() <= 0) {
        run.stopReason = run.stopReason ?? "page_limit";
        return;
      }
      const search = await groundedGoogleSearch({
        query,
        model: env.orcaSearchModel,
      });
      run.searchCount += 1;
      run.model = search.actualModel ?? run.model;
      run.costUsd = (run.costUsd ?? 0) + (search.usage.costUsd ?? 0);
      run.costJpy = (run.costJpy ?? 0) + (search.usage.costJpy ?? 0);
      const cites = search.citations.map((c) => c.url);
      run.citationUrls = [...new Set([...run.citationUrls, ...cites])].slice(0, 12);
      for (const cite of cites) enqueueUrl(urls, cite);
    };

    // 公式サイトと同一オリジン料金ページを先に処理（citation で page 枠を使い切らない）。
    await processQueuedPages();

    if (factsSaved === 0 && run.searchCount < MAX_SEARCH && Date.now() < deadline && pagesRemaining() > 0) {
      await runSearch([input.venueName, input.address, input.placeId, "料金 公式"].filter(Boolean).join(" "));
      await processQueuedPages();
    }

    if (factsSaved === 0 && run.searchCount < MAX_SEARCH && Date.now() < deadline && pagesRemaining() > 0) {
      await runSearch(`${input.venueName} 入場料 OR メニュー 料金 公式サイト`);
      await processQueuedPages();
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
