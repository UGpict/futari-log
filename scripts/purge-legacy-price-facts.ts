/**
 * Purge legacy price facts (pre-amount stableFactId) from file or Firestore.
 *
 *   DATA_BACKEND=file npx tsx scripts/purge-legacy-price-facts.ts
 *   DATA_BACKEND=firestore FIRESTORE_NAMESPACE=... npx tsx scripts/purge-legacy-price-facts.ts
 *
 * Optional: PLACE_ID=ChIJ... to limit to one place.
 */
export {};

process.env.USE_FIREBASE_EMULATOR ??= "false";

async function main() {
  const { getEnv } = await import("../src/config/env");
  const {
    isLegacyPriceFact,
    listFactsForPlace,
    deleteFact,
  } = await import("../src/server/catalog/priceRepo");
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");

  const env = getEnv();
  const onlyPlace = process.env.PLACE_ID?.trim() || null;
  console.log(JSON.stringify({ dataBackend: env.dataBackend, onlyPlace }, null, 2));

  let placeIds: string[] = [];
  if (onlyPlace) {
    placeIds = [onlyPlace];
  } else if (env.dataBackend === "file") {
    const path = join(process.cwd(), ".data", "spot-prices.json");
    if (!existsSync(path)) {
      console.log(JSON.stringify({ removed: 0, note: "no spot-prices.json" }));
      return;
    }
    const db = JSON.parse(readFileSync(path, "utf8")) as {
      facts?: Record<string, { placeId?: string }>;
    };
    placeIds = [
      ...new Set(
        Object.values(db.facts ?? {})
          .map((f) => f.placeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
  } else {
    console.log(
      JSON.stringify({
        stopped: true,
        reason: "Firestore full scan needs PLACE_ID=... (safer). Pass PLACE_ID to purge one place.",
      }),
    );
    process.exit(1);
  }

  let removed = 0;
  const samples: { placeId: string; id: string; quote: string | null; amountMinJpy: number | null }[] = [];
  for (const placeId of placeIds) {
    const facts = await listFactsForPlace(placeId);
    for (const fact of facts) {
      if (!isLegacyPriceFact(fact)) continue;
      await deleteFact(fact.id);
      removed += 1;
      if (samples.length < 12) {
        samples.push({
          placeId,
          id: fact.id,
          quote: fact.quote,
          amountMinJpy: fact.amountMinJpy,
        });
      }
    }
  }
  console.log(JSON.stringify({ removed, places: placeIds.length, samples }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
