/**
 * LIVE Places → spot.categories → wish judgment.
 * Uses committed provider mapping (primaryType + types via placeTypeList).
 *
 * Usage: npx tsx scripts/verify-place-types-live.ts
 */
process.env.ENABLE_DEMO_CONTROLS ??= "true";

import { placeTypeList, spotMatchesWish, typesOf } from "../src/contracts/spotKinds";
import { PLACES_FIELD_MASK_SEARCH, PLACES_FIELD_MASK_DETAILS } from "../src/config/settings";

async function main() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error("GOOGLE_MAPS_API_KEY missing");
    process.exit(2);
  }

  const searchRes = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK_SEARCH,
    },
    body: JSON.stringify({
      includedTypes: ["cafe"],
      maxResultCount: 3,
      languageCode: "ja",
      locationRestriction: {
        circle: {
          center: { latitude: 35.681236, longitude: 139.767125 },
          radius: 800,
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!searchRes.ok) {
    throw new Error(`searchNearby ${searchRes.status} ${(await searchRes.text()).slice(0, 200)}`);
  }
  const searchData = (await searchRes.json()) as {
    places?: {
      id: string;
      displayName?: { text: string };
      types?: string[];
      primaryType?: string;
    }[];
  };
  const raw = searchData.places?.[0];
  if (!raw?.id) throw new Error("no LIVE cafe near Tokyo Station");

  const categories = placeTypeList(raw.primaryType, raw.types);
  const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(raw.id)}`, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACES_FIELD_MASK_DETAILS,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!detailsRes.ok) throw new Error(`details ${detailsRes.status}`);
  const details = (await detailsRes.json()) as {
    id: string;
    displayName?: { text: string };
    types?: string[];
    primaryType?: string;
  };
  const detailCategories = placeTypeList(details.primaryType, details.types);
  const spot = {
    name: details.displayName?.text ?? raw.displayName?.text ?? raw.id,
    categories: detailCategories,
    types: details.types,
    primaryType: details.primaryType,
  };
  const wishHit = spotMatchesWish(spot, "カフェ");
  const typeSource = typesOf(spot);

  const report = {
    ok:
      Boolean(raw.primaryType || (raw.types && raw.types.length)) &&
      categories.length > 0 &&
      detailCategories.length > 0 &&
      typeSource.length > 0 &&
      wishHit &&
      (!raw.primaryType || categories.includes(raw.primaryType)) &&
      !(raw.types ?? []).some((t) => !categories.includes(t)) &&
      !(details.types ?? []).some((t) => !detailCategories.includes(t)),
    placeId: raw.id,
    name: spot.name,
    placesResponse: {
      primaryType: raw.primaryType ?? null,
      types: raw.types ?? [],
    },
    detailsResponse: {
      primaryType: details.primaryType ?? null,
      types: details.types ?? [],
    },
    spotCategories: detailCategories,
    typesOf: typeSource,
    wishCafe: wishHit,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
