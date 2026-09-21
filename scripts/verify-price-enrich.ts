/**
 * LIVE verify for price enrichment. Never writes production Firestore.
 *
 *   npx tsx scripts/verify-price-enrich.ts
 */
export {};

process.env.DATA_BACKEND = "file";
process.env.USE_FIREBASE_EMULATOR = "false";

async function main() {
  const { join } = await import("node:path");
  const { getEnv } = await import("../src/config/env");
  const { enrichSpotPrice } = await import("../src/server/catalog/priceEnrich");
  const { listFactsForPlace, getEnrichRun } = await import("../src/server/catalog/priceRepo");
  const { applyStoredPricesToSpot } = await import("../src/server/catalog/applyStoredPrices");
  type Spot = import("../src/domain/schemas").Spot;

  const env = getEnv();
  const writeTarget = {
    dataBackend: env.dataBackend,
    filePath: join(process.cwd(), ".data", "spot-prices.json"),
  };
  if (env.dataBackend !== "file") {
    console.log(
      JSON.stringify({
        stopped: true,
        reason: "refusing non-file backend (would risk production Firestore)",
        writeTarget,
      }),
    );
    process.exit(1);
  }
  console.log(JSON.stringify({ writeTarget, note: "local .data/spot-prices.json only" }));

  if (!env.orcaApiKey) {
    console.log(JSON.stringify({ skipped: true, reason: "ORCAROUTER_API_KEY missing" }));
    return;
  }

  const targets = [
    {
      placeId: "ChIJq6rq_BuJGGARh1qAooLX-as",
      venueName: "東京都現代美術館",
      websiteUri: "https://www.mot-art-museum.jp/" as string | null,
      categories: ["museum"],
    },
    {
      placeId: "ChIJYXjHTQCJGGARnZy1AU66hSw",
      venueName: "清澄庭園",
      websiteUri: "https://www.tokyo-park.or.jp/park/kiyosumi/index.html" as string | null,
      categories: ["park"],
    },
    {
      placeId: "ChIJO8G4NACJGGARPW7xQDNOWVc",
      venueName: "ヒキダシ",
      websiteUri: null as string | null,
      categories: ["cafe"],
    },
    {
      placeId: "ChIJN1t_t3uLGGARbnneFxI-s_E",
      venueName: "鳥貴族 清澄白河店",
      websiteUri: "https://torikizoku.co.jp/menu/" as string | null,
      categories: ["izakaya", "bar"],
    },
  ];

  const results = [];
  for (const t of targets) {
    const before = await listFactsForPlace(t.placeId);
    const started = Date.now();
    const run = await enrichSpotPrice({
      placeId: t.placeId,
      venueName: t.venueName,
      websiteUri: t.websiteUri,
      reason: "verify_script",
    });
    const enrichMeta = await getEnrichRun(run.runId);
    const after = await listFactsForPlace(t.placeId);
    const stub: Spot = {
      id: t.placeId,
      name: t.venueName,
      lat: 0,
      lng: 0,
      categories: t.categories,
      environment: { value: "INDOOR", evidenceIds: [] },
      costForTwoJpy: { value: null, evidenceIds: [] },
      restEase: { value: null, evidenceIds: [] },
      standingBurden: { value: null, evidenceIds: [] },
      officialUrl: t.websiteUri,
    };
    const applied = await applyStoredPricesToSpot(stub);
    results.push({
      venue: t.venueName,
      placeId: t.placeId,
      beforeCount: before.length,
      afterCount: after.length,
      runId: run.runId,
      status: run.status,
      factsSaved: run.factsSaved,
      error: run.error,
      stopReason: enrichMeta?.stopReason ?? null,
      citationUrls: enrichMeta?.citationUrls ?? [],
      model: enrichMeta?.model ?? null,
      costUsd: enrichMeta?.costUsd ?? run.costUsd,
      costJpy: enrichMeta?.costJpy ?? null,
      pagesFetched: enrichMeta?.pagesFetched ?? null,
      searchCount: enrichMeta?.searchCount ?? null,
      latencyMs: Date.now() - started,
      facts: after.map((f) => ({
        kind: f.kind,
        amountMinJpy: f.amountMinJpy,
        amountMaxJpy: f.amountMaxJpy,
        unit: f.unit,
        usageKind: f.usageKind,
        confirmation: f.confirmation,
        sourceUrl: f.sourceUrl,
        quote: f.quote,
        branchMatch: f.branchMatch,
      })),
      accounting: applied.costAccounting,
      costForTwoJpy: applied.costForTwoJpy.value,
    });
  }
  console.log(JSON.stringify({ skipped: false, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
