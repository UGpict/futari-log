import { normalizePlaceType, searchTypesForWishText } from "@/contracts/spotKinds";
import type { Spot, Evidence } from "@/domain/schemas";
import { realNowIso } from "@/lib/time";

export type CatalogSpot = Spot & {
  types: string[];
  hours: { days: number[]; open: string; close: string }[];
  /** currentOpeningHours 相当。YYYY-MM-DD → その日の open/close。 */
  datedHours?: Record<string, { open: string; close: string }>;
  walkRestHint: string | null;
};

function ev(id: string, field: string, note: string): Evidence {
  return {
    id,
    kind: "API",
    provider: "mock-places",
    sourceRef: id.replace(/^ev-/, ""),
    sourceField: field,
    fetchedAt: realNowIso(),
    validFor: null,
    note,
  };
}

export const MOCK_CATALOG: CatalogSpot[] = [
  {
    id: "mock:nagoya-station",
    name: "名古屋駅",
    lat: 35.170915,
    lng: 136.881537,
    categories: ["transit_station"],
    types: ["transit_station", "point_of_interest"],
    environment: { value: "MIXED", evidenceIds: ["ev-st-env"] },
    costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: ["ev-st-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-st-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-st-stand"] },
    officialUrl: "https://top.jr-central.co.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "00:00", close: "24:00" }],
    walkRestHint: null,
  },
  {
    id: "mock:nagoya-castle",
    name: "名古屋城",
    lat: 35.185582,
    lng: 136.899688,
    categories: ["tourist_attraction", "park"],
    types: ["tourist_attraction", "park"],
    environment: { value: "OUTDOOR", evidenceIds: ["ev-castle-env"] },
    costForTwoJpy: { value: { min: 1000, max: 1500 }, evidenceIds: ["ev-castle-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-castle-rest"] },
    standingBurden: { value: "HIGH", evidenceIds: ["ev-castle-stand"] },
    officialUrl: "https://www.nagoyajo.city.nagoya.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "09:00", close: "16:30" }],
    walkRestHint: "屋外の城址。長い歩行と立位が見込まれる（カテゴリからの推定）",
  },
  {
    id: "mock:noritake-garden",
    name: "ノリタケの森",
    lat: 35.1794,
    lng: 136.8814,
    categories: ["park", "tourist_attraction"],
    types: ["park", "tourist_attraction"],
    environment: { value: "OUTDOOR", evidenceIds: ["ev-nori-env"] },
    costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: ["ev-nori-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-nori-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-nori-stand"] },
    officialUrl: "https://www.noritake.co.jp/mori/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "10:00", close: "17:00" }],
    walkRestHint: "散策できる庭園。ベンチあり（施設説明からの推定）",
  },
  {
    id: "mock:aichi-art-museum",
    name: "愛知県美術館",
    lat: 35.170278,
    lng: 136.908611,
    categories: ["art_gallery", "museum"],
    types: ["art_gallery", "museum"],
    environment: { value: "INDOOR", evidenceIds: ["ev-art-env"] },
    costForTwoJpy: { value: { min: 2800, max: 3600 }, evidenceIds: ["ev-art-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-art-rest"] },
    standingBurden: { value: "HIGH", evidenceIds: ["ev-art-stand"] },
    officialUrl: "https://www-art.aac.pref.aichi.jp/",
    hours: [
      { days: [0, 2, 3, 4, 5, 6], open: "10:00", close: "18:00" },
    ],
    walkRestHint: "展示鑑賞は立位が続きやすい（カテゴリからの推定）",
  },
  {
    id: "mock:science-museum",
    name: "名古屋市科学館",
    lat: 35.164722,
    lng: 136.899444,
    categories: ["museum"],
    types: ["museum"],
    environment: { value: "INDOOR", evidenceIds: ["ev-sci-env"] },
    costForTwoJpy: { value: { min: 800, max: 1200 }, evidenceIds: ["ev-sci-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-sci-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-sci-stand"] },
    officialUrl: "https://www.ncsm.city.nagoya.jp/",
    hours: [{ days: [0, 2, 3, 4, 5, 6], open: "09:30", close: "17:00" }],
    walkRestHint: "屋内展示。一部に休憩スペース（カテゴリからの推定）",
  },
  {
    id: "mock:komeda-meieki",
    name: "コメダ珈琲店 名駅店",
    lat: 35.1702,
    lng: 136.8831,
    categories: ["cafe"],
    types: ["cafe", "bakery"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kom-env"] },
    costForTwoJpy: { value: { min: 1800, max: 2800 }, evidenceIds: ["ev-kom-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-kom-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-kom-stand"] },
    officialUrl: "https://www.komeda.co.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "07:00", close: "22:00" }],
    walkRestHint: "座席中心の喫茶。休憩向き（カテゴリからの推定）",
  },
  {
    id: "mock:midland-square",
    name: "ミッドランドスクエア スカイプロムナード",
    lat: 35.17005,
    lng: 136.8849,
    categories: ["tourist_attraction"],
    types: ["tourist_attraction", "point_of_interest"],
    environment: { value: "MIXED", evidenceIds: ["ev-mid-env"] },
    costForTwoJpy: { value: { min: 2000, max: 2500 }, evidenceIds: ["ev-mid-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-mid-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-mid-stand"] },
    officialUrl: "https://www.midland-square.com/sky-promenade/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "11:00", close: "21:00" }],
    walkRestHint: null,
  },
  {
    id: "mock:oasis21",
    name: "オアシス21",
    lat: 35.17056,
    lng: 136.91028,
    categories: ["park", "tourist_attraction"],
    types: ["park", "shopping_mall"],
    environment: { value: "OUTDOOR", evidenceIds: ["ev-oas-env"] },
    costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: ["ev-oas-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-oas-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-oas-stand"] },
    officialUrl: "https://www.sakaepark.co.jp/oasis21/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "08:00", close: "23:00" }],
    walkRestHint: "屋外の複合施設。屋根付き部分あり",
  },
  {
    id: "mock:takashimaya-sweets",
    name: "ジェイアール名古屋タカシマヤ スイーツ",
    lat: 35.1707,
    lng: 136.8826,
    categories: ["cafe", "bakery"],
    types: ["bakery", "store"],
    environment: { value: "INDOOR", evidenceIds: ["ev-taka-env"] },
    costForTwoJpy: { value: { min: 1600, max: 3200 }, evidenceIds: ["ev-taka-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-taka-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-taka-stand"] },
    officialUrl: "https://www.jrtk.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "10:00", close: "20:00" }],
    walkRestHint: "百貨店内。座席は限られる可能性（推定）",
  },
  {
    id: "mock:tokyo-station-gallery",
    name: "東京ステーションギャラリー",
    lat: 35.68136,
    lng: 139.76745,
    categories: ["art_gallery", "museum"],
    types: ["art_gallery", "museum"],
    environment: { value: "INDOOR", evidenceIds: ["ev-tsg-env"] },
    costForTwoJpy: { value: { min: 2800, max: 3200 }, evidenceIds: ["ev-tsg-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-tsg-rest"] },
    standingBurden: { value: "HIGH", evidenceIds: ["ev-tsg-stand"] },
    officialUrl: "https://www.ejrcf.or.jp/gallery/",
    hours: [{ days: [0, 2, 3, 4, 5, 6], open: "10:00", close: "18:00" }],
    walkRestHint: "東京駅構内の美術館。月曜休館（モック営業）",
  },
  {
    id: "mock:imperial-palace-outer",
    name: "皇居外苑",
    lat: 35.6804,
    lng: 139.7569,
    categories: ["park", "tourist_attraction"],
    types: ["park", "tourist_attraction"],
    environment: { value: "OUTDOOR", evidenceIds: ["ev-imp-env"] },
    costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: ["ev-imp-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-imp-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-imp-stand"] },
    officialUrl: "https://www.env.go.jp/garden/kokyogaien/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "00:00", close: "24:00" }],
    walkRestHint: "屋外の園地。歩行が主（カテゴリからの推定）",
  },
  {
    id: "mock:cafe-kitte",
    name: "カフェ 丸の内KITTE",
    lat: 35.6798,
    lng: 139.7647,
    categories: ["cafe", "bakery"],
    types: ["cafe", "bakery"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kitte-env"] },
    costForTwoJpy: { value: { min: 1800, max: 2800 }, evidenceIds: ["ev-kitte-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-kitte-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-kitte-stand"] },
    officialUrl: "https://jptower-kitte.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "11:00", close: "21:00" }],
    walkRestHint: "座席中心のカフェ。休憩向き（カテゴリからの推定）",
  },
  {
    id: "mock:cafe-gransta",
    name: "カフェ グランスタ東京",
    lat: 35.68105,
    lng: 139.76735,
    categories: ["cafe", "bakery"],
    types: ["cafe", "bakery"],
    environment: { value: "INDOOR", evidenceIds: ["ev-gran-env"] },
    costForTwoJpy: { value: { min: 1600, max: 2600 }, evidenceIds: ["ev-gran-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-gran-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-gran-stand"] },
    officialUrl: "https://gransta.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "08:00", close: "22:00" }],
    walkRestHint: "東京駅構内のカフェ。座席中心（カテゴリからの推定）",
  },
  {
    id: "mock:kitte-mall",
    name: "KITTE 丸の内",
    lat: 35.6799,
    lng: 139.7648,
    categories: ["shopping_mall"],
    types: ["shopping_mall"],
    environment: { value: "INDOOR", evidenceIds: ["ev-mall-env"] },
    costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: ["ev-mall-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-mall-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-mall-stand"] },
    officialUrl: "https://jptower-kitte.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "11:00", close: "21:00" }],
    walkRestHint: "駅前の商業施設",
  },
  {
    id: "mock:maruzen-marunouchi",
    name: "丸善 丸の内本店",
    lat: 35.6816,
    lng: 139.7639,
    categories: ["bookstore"],
    types: ["bookstore"],
    environment: { value: "INDOOR", evidenceIds: ["ev-book-env"] },
    costForTwoJpy: { value: { min: 0, max: 0 }, evidenceIds: ["ev-book-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-book-rest"] },
    standingBurden: { value: "MEDIUM", evidenceIds: ["ev-book-stand"] },
    officialUrl: "https://www.maruzenjunkudo.co.jp/",
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "09:00", close: "21:00" }],
    walkRestHint: "書店。座席は限られる",
  },
  // --- 清澄白河: 営業時間判定・self-correct 再現用 ---
  {
    id: "mock:kiyosumi-museum-holiday-open",
    name: "清澄モック祝日開館ミュージアム",
    lat: 35.6824,
    lng: 139.7992,
    categories: ["museum", "art_gallery"],
    types: ["museum", "art_gallery"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kmh-env"] },
    costForTwoJpy: { value: { min: 2000, max: 2800 }, evidenceIds: ["ev-kmh-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-kmh-rest"] },
    standingBurden: { value: "HIGH", evidenceIds: ["ev-kmh-stand"] },
    officialUrl: null,
    // 通常は月曜休み。祝日月曜 2026-09-21 だけ current で開く。
    hours: [
      { days: [0], open: "10:00", close: "18:00" },
      { days: [2], open: "10:00", close: "18:00" },
      { days: [3], open: "10:00", close: "18:00" },
      { days: [4], open: "10:00", close: "18:00" },
      { days: [5], open: "10:00", close: "18:00" },
      { days: [6], open: "10:00", close: "18:00" },
    ],
    datedHours: { "2026-09-21": { open: "10:00", close: "18:00" } },
    walkRestHint: "通常月曜休館。祝日開館は currentOpeningHours 側",
  },
  {
    id: "mock:kiyosumi-museum-closed",
    name: "清澄モック休館ミュージアム",
    lat: 35.6826,
    lng: 139.7995,
    categories: ["museum", "art_gallery"],
    types: ["museum", "art_gallery"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kmc-env"] },
    costForTwoJpy: { value: { min: 1800, max: 2400 }, evidenceIds: ["ev-kmc-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-kmc-rest"] },
    standingBurden: { value: "HIGH", evidenceIds: ["ev-kmc-stand"] },
    officialUrl: null,
    // 通常も当日も休み（dated に 09-21 なし。current は別日のみ）。
    hours: [
      { days: [0], open: "10:00", close: "18:00" },
      { days: [2], open: "10:00", close: "18:00" },
      { days: [3], open: "10:00", close: "18:00" },
      { days: [4], open: "10:00", close: "18:00" },
      { days: [5], open: "10:00", close: "18:00" },
      { days: [6], open: "10:00", close: "18:00" },
    ],
    datedHours: { "2026-09-22": { open: "10:00", close: "18:00" } },
    walkRestHint: "月曜は通常・当日とも休み",
  },
  {
    id: "mock:kiyosumi-museum-closed-2",
    name: "清澄モック休館ギャラリー",
    lat: 35.6819,
    lng: 139.7982,
    categories: ["museum", "art_gallery"],
    types: ["art_gallery", "museum"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kmc2-env"] },
    costForTwoJpy: { value: { min: 1500, max: 2200 }, evidenceIds: ["ev-kmc2-cost"] },
    restEase: { value: "LIMITED", evidenceIds: ["ev-kmc2-rest"] },
    standingBurden: { value: "HIGH", evidenceIds: ["ev-kmc2-stand"] },
    officialUrl: null,
    hours: [
      { days: [0], open: "10:00", close: "18:00" },
      { days: [2], open: "10:00", close: "18:00" },
      { days: [3], open: "10:00", close: "18:00" },
      { days: [4], open: "10:00", close: "18:00" },
      { days: [5], open: "10:00", close: "18:00" },
      { days: [6], open: "10:00", close: "18:00" },
    ],
    datedHours: { "2026-09-23": { open: "10:00", close: "18:00" } },
    walkRestHint: "旧 self-correct が無確認で補充してしまう休館展示",
  },
  {
    id: "mock:kiyosumi-cafe-unknown",
    name: "清澄モック営業不明カフェ",
    lat: 35.6820,
    lng: 139.7985,
    categories: ["cafe"],
    types: ["cafe", "coffee_shop"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kcu-env"] },
    costForTwoJpy: { value: { min: 1200, max: 2000 }, evidenceIds: ["ev-kcu-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-kcu-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-kcu-stand"] },
    officialUrl: null,
    hours: [],
    datedHours: {},
    walkRestHint: "営業時間未登録 → UNKNOWN",
  },
  {
    id: "mock:kiyosumi-cafe-open",
    name: "清澄モック夜カフェ",
    lat: 35.6823,
    lng: 139.7988,
    categories: ["cafe"],
    types: ["cafe", "coffee_shop"],
    environment: { value: "INDOOR", evidenceIds: ["ev-kco-env"] },
    costForTwoJpy: { value: { min: 1400, max: 2200 }, evidenceIds: ["ev-kco-cost"] },
    restEase: { value: "EASY", evidenceIds: ["ev-kco-rest"] },
    standingBurden: { value: "LOW", evidenceIds: ["ev-kco-stand"] },
    officialUrl: null,
    hours: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "11:00", close: "22:00" }],
    datedHours: { "2026-09-21": { open: "11:00", close: "22:00" } },
    walkRestHint: "self-correct 補充で OPEN 確認できるカフェ",
  },
];

export const MOCK_EVIDENCE: Evidence[] = MOCK_CATALOG.flatMap((spot) => [
  ev(`${spot.environment.evidenceIds[0]}`, "environment", "モックカタログ。LIVEでは Places types から推定"),
  ev(`${spot.costForTwoJpy.evidenceIds[0]}`, "costForTwoJpy", "モック料金。価格帯カテゴリからの円換算はしていない"),
  ev(`${spot.restEase.evidenceIds[0]}`, "restEase", spot.walkRestHint ?? "推定根拠が弱い場合は UNKNOWN"),
  ev(`${spot.standingBurden.evidenceIds[0]}`, "standingBurden", spot.walkRestHint ?? "カテゴリからのESTIMATED"),
]);

export function searchCatalogByName(query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return MOCK_CATALOG.filter((s) => `${s.name} ${s.types.join(" ")}`.toLowerCase().includes(needle)).slice(0, 8);
}

export function getCatalogSpot(id: string): CatalogSpot | undefined {
  return MOCK_CATALOG.find((s) => s.id === id);
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function searchCatalog(
  category: string,
  area?: { lat: number; lng: number },
  radiusMeters?: number,
  includedTypes?: string[],
): CatalogSpot[] {
  const wanted = (includedTypes?.length ? includedTypes : searchTypesForWishText(category)).map(normalizePlaceType).filter(Boolean);
  return MOCK_CATALOG.filter((s) => {
    if (area && radiusMeters != null && haversineMeters(s, area) > radiusMeters) return false;
    const types = [...s.categories, ...s.types].map(normalizePlaceType);
    if (wanted.length) {
      const set = new Set(types);
      return wanted.some((type) => set.has(type));
    }
    const blob = `${s.name} ${types.join(" ")}`.toLowerCase();
    return blob.includes(category.toLowerCase());
  });
}

export { ev as mockEvidence };
