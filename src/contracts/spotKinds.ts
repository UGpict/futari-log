export const SPOT_KIND_IDS = [
  "dining",
  "sweets",
  "cafe",
  "museum",
  "nature",
  "shopping",
  "cinema",
  "aquarium",
  "leisure",
  "sports",
  "spa",
  "bar",
  "town",
  "other",
] as const;

export type SpotKindId = (typeof SPOT_KIND_IDS)[number];

export const SPOT_KIND_DISPLAY_ORDER = SPOT_KIND_IDS.filter(
  (id): id is Exclude<SpotKindId, "other"> => id !== "other",
);

export type ScoutBucket = "walk" | "exhibit" | "sweets" | "other";

export type WishFacetId =
  | "dining"
  | "meat"
  | "sushi"
  | "italian"
  | "street_food"
  | "sweets"
  | "sweet_treat"
  | "cafe"
  | "museum"
  | "park"
  | "beach"
  | "mall"
  | "bookstore"
  | "movie"
  | "stage"
  | "aquarium"
  | "amusement"
  | "zoo"
  | "arcade"
  | "bowling"
  | "gym"
  | "sports"
  | "onsen"
  | "spa"
  | "sauna"
  | "sento"
  | "bar"
  | "town"
  | "craft";

export type WishConfidence = "type" | "name";

export type WishMatch = {
  facetId: WishFacetId;
  kind: SpotKindId;
  confidence: WishConfidence;
  sourceTypes: string[];
  note: string;
};

type SpotKindDef = {
  id: SpotKindId;
  label: string;
  examples: string;
  bucket: ScoutBucket;
  rankPreference: "POPULARITY" | "DISTANCE";
  scoutCategory: string;
  searchTypes: readonly string[];
  placeTypes: readonly string[];
  name: RegExp;
};

type WishFacet = {
  id: WishFacetId;
  kind: Exclude<SpotKindId, "other">;
  wish: RegExp;
  searchTypes: readonly string[];
  fulfillTypes: readonly string[];
  name: RegExp;
  bucket: ScoutBucket;
  rankPreference: "POPULARITY" | "DISTANCE";
  scoutCategory: string;
};

const GENERIC_PLACE_TYPES = new Set([
  "food",
  "point_of_interest",
  "establishment",
  "store",
  "premise",
  "geocode",
  "plus_code",
  "route",
  "street_address",
  "neighborhood",
  "locality",
  "sublocality",
  "political",
]);

export const SPOT_KIND_DEFS: Record<Exclude<SpotKindId, "other">, SpotKindDef> = {
  cafe: {
    id: "cafe",
    label: "カフェ",
    examples: "カフェ・喫茶・コーヒー",
    bucket: "sweets",
    rankPreference: "DISTANCE",
    scoutCategory: "カフェ",
    searchTypes: ["cafe"],
    placeTypes: ["cafe", "coffee_shop", "tea_house"],
    name: /カフェ|喫茶|珈琲|コーヒー|coffee/i,
  },
  sweets: {
    id: "sweets",
    label: "スイーツ",
    examples: "ケーキ・パフェ・パン屋",
    bucket: "sweets",
    rankPreference: "POPULARITY",
    scoutCategory: "スイーツ",
    searchTypes: ["bakery", "dessert_shop"],
    placeTypes: ["bakery", "dessert_shop", "ice_cream_shop", "confectionery"],
    name: /スイーツ|ケーキ|デザート|パフェ|菓子|パン屋|bakery|dessert/i,
  },
  bar: {
    id: "bar",
    label: "バー・お酒",
    examples: "バー・ワイン・酒場",
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "バー",
    searchTypes: ["bar"],
    placeTypes: ["bar", "wine_bar", "night_club", "pub"],
    name: /バー|ワイン|酒場|居酒屋|bar|wine/i,
  },
  dining: {
    id: "dining",
    label: "食事",
    examples: "レストラン・寿司・焼肉・食堂",
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "食事",
    searchTypes: ["restaurant"],
    placeTypes: [
      "restaurant",
      "japanese_restaurant",
      "sushi_restaurant",
      "ramen_restaurant",
      "steak_house",
      "barbecue_restaurant",
      "italian_restaurant",
      "korean_restaurant",
      "chinese_restaurant",
      "french_restaurant",
      "seafood_restaurant",
      "meal_takeaway",
      "meal_delivery",
      "fast_food_restaurant",
      "pizza_restaurant",
      "hamburger_restaurant",
    ],
    name: /レストラン|飲食店|料理|食堂|寿司|焼肉|ランチ|ディナー|restaurant/i,
  },
  museum: {
    id: "museum",
    label: "アート・展示",
    examples: "美術館・博物館・ギャラリー",
    bucket: "exhibit",
    rankPreference: "POPULARITY",
    scoutCategory: "展示",
    searchTypes: ["museum", "art_gallery"],
    placeTypes: ["museum", "art_gallery", "cultural_center", "exhibition"],
    name: /美術館|博物館|ギャラリー|展示|科学館|museum|gallery/i,
  },
  cinema: {
    id: "cinema",
    label: "映画・舞台",
    examples: "映画館・劇場・演劇",
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "映画",
    searchTypes: ["movie_theater"],
    placeTypes: ["movie_theater", "performing_arts_theater", "concert_hall"],
    name: /映画|シネマ|劇場|演劇|cinema|theater/i,
  },
  aquarium: {
    id: "aquarium",
    label: "水族館",
    examples: "水族館・海の施設",
    bucket: "exhibit",
    rankPreference: "POPULARITY",
    scoutCategory: "水族館",
    searchTypes: ["aquarium"],
    placeTypes: ["aquarium"],
    name: /水族館|aquarium/i,
  },
  spa: {
    id: "spa",
    label: "温泉・スパ",
    examples: "温泉・銭湯・サウナ",
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "温泉",
    searchTypes: ["spa"],
    placeTypes: ["spa", "sauna", "public_bath"],
    name: /温泉|銭湯|スパ|サウナ|spa/i,
  },
  sports: {
    id: "sports",
    label: "スポーツ",
    examples: "運動・ボウリング・ジム",
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "スポーツ",
    searchTypes: ["gym", "bowling_alley"],
    placeTypes: ["gym", "fitness_center", "bowling_alley", "stadium", "sports_complex", "golf_course"],
    name: /スポーツ|運動|ボウリング|ジム|sports/i,
  },
  leisure: {
    id: "leisure",
    label: "遊び・体験",
    examples: "遊園地・ゲーム・ものづくり",
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "遊び",
    searchTypes: ["amusement_park"],
    placeTypes: ["amusement_park", "amusement_center", "zoo", "water_park"],
    name: /遊園地|テーマパーク|ゲームセンター|動物園|レジャー|amusement|zoo/i,
  },
  nature: {
    id: "nature",
    label: "散策",
    examples: "公園・森・庭園・散歩",
    bucket: "walk",
    rankPreference: "DISTANCE",
    scoutCategory: "散策",
    searchTypes: ["park"],
    placeTypes: ["park", "national_park", "garden", "botanical_garden", "campground", "hiking_area", "beach", "playground"],
    name: /公園|森|庭園|散歩|園地|park|garden|beach/i,
  },
  shopping: {
    id: "shopping",
    label: "買い物",
    examples: "ショッピング・雑貨・商業施設",
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "買い物",
    searchTypes: ["shopping_mall"],
    placeTypes: [
      "shopping_mall",
      "department_store",
      "clothing_store",
      "book_store",
      "bookstore",
      "gift_shop",
      "convenience_store",
      "supermarket",
    ],
    name: /ショッピング|買い物|雑貨|百貨店|商業施設|本屋|書店|shopping/i,
  },
  town: {
    id: "town",
    label: "街・建物",
    examples: "街歩き・展望台・建築",
    bucket: "walk",
    rankPreference: "POPULARITY",
    scoutCategory: "街",
    searchTypes: ["tourist_attraction"],
    placeTypes: [
      "tourist_attraction",
      "observation_deck",
      "historical_landmark",
      "visitor_center",
      "city_hall",
      "library",
      "church",
    ],
    name: /展望台|プロムナード|建築|スカイ/i,
  },
};

export const SPOT_KIND_OTHER = {
  id: "other" as const,
  label: "立ち寄りスポット",
  examples: "その他",
};

const CLASSIFY_ORDER: Exclude<SpotKindId, "other">[] = [
  "cafe",
  "sweets",
  "bar",
  "dining",
  "museum",
  "cinema",
  "aquarium",
  "spa",
  "sports",
  "leisure",
  "nature",
  "shopping",
  "town",
];

const SPECIFIC_TYPE_ORDER = CLASSIFY_ORDER.filter((id) => id !== "town");

export const WISH_FACETS: readonly WishFacet[] = [
  {
    id: "cafe",
    kind: "cafe",
    wish: /カフェ|喫茶|コーヒー/,
    searchTypes: ["cafe"],
    fulfillTypes: ["cafe", "coffee_shop", "tea_house"],
    name: /カフェ|喫茶|珈琲|コーヒー|coffee/i,
    bucket: "sweets",
    rankPreference: "DISTANCE",
    scoutCategory: "カフェ",
  },
  {
    id: "sweet_treat",
    kind: "sweets",
    wish: /甘いもの/,
    searchTypes: ["cafe", "bakery", "dessert_shop"],
    fulfillTypes: ["cafe", "coffee_shop", "tea_house", "bakery", "dessert_shop", "ice_cream_shop", "confectionery"],
    name: /甘い|スイーツ|カフェ|デザート/i,
    bucket: "sweets",
    rankPreference: "DISTANCE",
    scoutCategory: "甘いもの",
  },
  {
    id: "sweets",
    kind: "sweets",
    wish: /スイーツ|ケーキ|パフェ|パン屋|デザート|菓子|甘味/,
    searchTypes: ["bakery", "dessert_shop"],
    fulfillTypes: ["bakery", "dessert_shop", "ice_cream_shop", "confectionery"],
    name: /スイーツ|ケーキ|デザート|パフェ|菓子|パン屋|bakery|dessert/i,
    bucket: "sweets",
    rankPreference: "POPULARITY",
    scoutCategory: "スイーツ",
  },
  {
    id: "meat",
    kind: "dining",
    wish: /お肉|焼肉/,
    searchTypes: ["steak_house", "barbecue_restaurant"],
    fulfillTypes: ["steak_house", "barbecue_restaurant"],
    name: /焼肉|ステーキ|お肉|肉料理|yakiniku|steak/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "食事-焼肉",
  },
  {
    id: "sushi",
    kind: "dining",
    wish: /お寿司|寿司/,
    searchTypes: ["sushi_restaurant"],
    fulfillTypes: ["sushi_restaurant"],
    name: /寿司|すし|sushi/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "食事-寿司",
  },
  {
    id: "italian",
    kind: "dining",
    wish: /イタリアン/,
    searchTypes: ["italian_restaurant", "pizza_restaurant"],
    fulfillTypes: ["italian_restaurant", "pizza_restaurant"],
    name: /イタリアン|イタリア|ピザ|pasta|pizza|italian/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "食事-イタリアン",
  },
  {
    id: "street_food",
    kind: "dining",
    wish: /食べ歩き/,
    // market は検索候補に含めうるが、食品提供の根拠が無いので達成には使わない（温泉≠spa と同型）。
    searchTypes: ["meal_takeaway", "market"],
    fulfillTypes: ["meal_takeaway", "food_court"],
    name: /食べ歩き|屋台|フードコート|market/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "食事-食べ歩き",
  },
  {
    id: "dining",
    kind: "dining",
    wish: /食事|おいしい|レストラン|食堂|ランチ|ディナー/,
    searchTypes: ["restaurant"],
    fulfillTypes: [...SPOT_KIND_DEFS.dining.placeTypes],
    name: /レストラン|飲食店|料理|食堂|ランチ|ディナー|restaurant/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "食事",
  },
  {
    id: "craft",
    kind: "leisure",
    wish: /ものづくり体験|ものづくり/,
    searchTypes: [],
    fulfillTypes: [],
    name: /ものづくり|工房|体験工房/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "ものづくり体験",
  },
  {
    id: "museum",
    kind: "museum",
    wish: /美術館|博物館|ギャラリー|展示|アート/,
    searchTypes: ["museum", "art_gallery"],
    fulfillTypes: ["museum", "art_gallery", "cultural_center", "exhibition"],
    name: /美術館|博物館|ギャラリー|展示|科学館|museum|gallery/i,
    bucket: "exhibit",
    rankPreference: "POPULARITY",
    scoutCategory: "展示",
  },
  {
    id: "park",
    kind: "nature",
    wish: /公園|森|庭園|散歩|ピクニック|散策/,
    searchTypes: ["park"],
    fulfillTypes: ["park", "national_park", "garden", "botanical_garden", "campground", "hiking_area", "playground"],
    name: /公園|森|庭園|園地|park|garden/i,
    bucket: "walk",
    rankPreference: "DISTANCE",
    scoutCategory: "散策-公園",
  },
  {
    id: "beach",
    kind: "nature",
    wish: /海を眺める|ビーチ|海岸/,
    searchTypes: ["beach"],
    fulfillTypes: ["beach"],
    name: /ビーチ|海岸|海を|beach/i,
    bucket: "walk",
    rankPreference: "DISTANCE",
    scoutCategory: "散策-海",
  },
  {
    id: "mall",
    kind: "shopping",
    wish: /買い物|ショッピング|雑貨|商業施設/,
    searchTypes: ["shopping_mall"],
    fulfillTypes: ["shopping_mall", "department_store", "clothing_store", "gift_shop"],
    name: /ショッピング|買い物|雑貨|百貨店|商業施設|shopping/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "買い物",
  },
  {
    id: "bookstore",
    kind: "shopping",
    wish: /本屋|書店/,
    searchTypes: ["book_store", "bookstore"],
    fulfillTypes: ["book_store", "bookstore"],
    name: /本屋|書店|book/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "買い物-書店",
  },
  {
    id: "movie",
    kind: "cinema",
    wish: /映画/,
    searchTypes: ["movie_theater"],
    fulfillTypes: ["movie_theater"],
    name: /映画|シネマ|cinema/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "映画",
  },
  {
    id: "stage",
    kind: "cinema",
    wish: /劇場|演劇|舞台/,
    searchTypes: ["performing_arts_theater"],
    fulfillTypes: ["performing_arts_theater"],
    name: /劇場|演劇|舞台|theater/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "舞台",
  },
  {
    id: "aquarium",
    kind: "aquarium",
    wish: /水族館/,
    searchTypes: ["aquarium"],
    fulfillTypes: ["aquarium"],
    name: /水族館|aquarium/i,
    bucket: "exhibit",
    rankPreference: "POPULARITY",
    scoutCategory: "水族館",
  },
  {
    id: "zoo",
    kind: "leisure",
    wish: /動物園/,
    searchTypes: ["zoo"],
    fulfillTypes: ["zoo"],
    name: /動物園|zoo/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "遊び-動物園",
  },
  {
    id: "amusement",
    kind: "leisure",
    wish: /遊園地|テーマパーク/,
    searchTypes: ["amusement_park"],
    fulfillTypes: ["amusement_park", "water_park"],
    name: /遊園地|テーマパーク|amusement/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "遊び",
  },
  {
    id: "arcade",
    kind: "leisure",
    wish: /ゲーム/,
    searchTypes: ["amusement_center"],
    fulfillTypes: ["amusement_center"],
    name: /ゲームセンター|ゲーム/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "遊び-ゲーム",
  },
  {
    id: "bowling",
    kind: "sports",
    wish: /ボウリング/,
    searchTypes: ["bowling_alley"],
    fulfillTypes: ["bowling_alley"],
    name: /ボウリング|bowling/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "スポーツ-ボウリング",
  },
  {
    id: "gym",
    kind: "sports",
    wish: /ジム|運動/,
    searchTypes: ["gym"],
    fulfillTypes: ["gym", "fitness_center"],
    name: /ジム|運動|fitness/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "スポーツ-ジム",
  },
  {
    id: "sports",
    kind: "sports",
    wish: /スポーツ/,
    searchTypes: ["gym", "bowling_alley"],
    fulfillTypes: ["gym", "fitness_center", "bowling_alley", "stadium", "sports_complex", "golf_course"],
    name: /スポーツ|sports/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "スポーツ",
  },
  {
    id: "onsen",
    kind: "spa",
    wish: /温泉/,
    searchTypes: ["spa"],
    fulfillTypes: [],
    name: /温泉/,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "温泉",
  },
  {
    id: "spa",
    kind: "spa",
    wish: /スパ/,
    searchTypes: ["spa"],
    fulfillTypes: ["spa"],
    name: /スパ|spa/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "スパ",
  },
  {
    id: "sauna",
    kind: "spa",
    wish: /サウナ/,
    searchTypes: ["sauna"],
    fulfillTypes: ["sauna"],
    name: /サウナ|sauna/i,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "サウナ",
  },
  {
    id: "sento",
    kind: "spa",
    wish: /銭湯/,
    searchTypes: ["public_bath"],
    fulfillTypes: ["public_bath"],
    name: /銭湯/,
    bucket: "other",
    rankPreference: "DISTANCE",
    scoutCategory: "銭湯",
  },
  {
    id: "bar",
    kind: "bar",
    wish: /バー|ワイン|酒場|お酒|居酒屋|飲み屋/,
    searchTypes: ["bar"],
    fulfillTypes: ["bar", "wine_bar", "night_club", "pub"],
    name: /バー|ワイン|酒場|居酒屋|飲み屋|bar|wine/i,
    bucket: "other",
    rankPreference: "POPULARITY",
    scoutCategory: "バー",
  },
  {
    id: "town",
    kind: "town",
    wish: /街歩き|展望台|街の写真|ぶらぶら|寄り道/,
    searchTypes: ["tourist_attraction"],
    fulfillTypes: ["tourist_attraction", "observation_deck", "historical_landmark", "visitor_center"],
    name: /展望台|プロムナード|建築|スカイ/i,
    bucket: "walk",
    rankPreference: "POPULARITY",
    scoutCategory: "街",
  },
];

export function normalizePlaceType(type: string): string {
  const value = type.trim().toLowerCase();
  if (value === "bookstore") return "book_store";
  return value;
}

export function placeTypeList(...groups: Array<string | null | undefined | readonly string[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const list = Array.isArray(group) ? group : group ? [group] : [];
    for (const raw of list) {
      const type = normalizePlaceType(String(raw));
      if (!type || seen.has(type)) continue;
      seen.add(type);
      out.push(type);
    }
  }
  return out;
}

function typedSet(types: readonly string[]): Set<string> {
  return new Set(placeTypeList(types).filter((type) => !GENERIC_PLACE_TYPES.has(type)));
}

function intersectingTypes(types: ReadonlySet<string>, wanted: readonly string[]): string[] {
  return wanted.map(normalizePlaceType).filter((type) => type && types.has(type));
}

export function classifySpotKind(name: string, types: readonly string[] = []): SpotKindId {
  const set = typedSet(types);
  for (const id of SPECIFIC_TYPE_ORDER) {
    if (SPOT_KIND_DEFS[id].placeTypes.some((type) => set.has(normalizePlaceType(type)))) {
      return id;
    }
  }
  for (const id of CLASSIFY_ORDER) {
    if (SPOT_KIND_DEFS[id].name.test(name)) return id;
  }
  if (SPOT_KIND_DEFS.town.placeTypes.some((type) => set.has(normalizePlaceType(type)))) {
    return "town";
  }
  return "other";
}

export function matchableKinds(types: readonly string[] = []): SpotKindId[] {
  const set = typedSet(types);
  return CLASSIFY_ORDER.filter((id) =>
    SPOT_KIND_DEFS[id].placeTypes.some((type) => set.has(normalizePlaceType(type))),
  );
}

export function spotMatchesKind(name: string, types: readonly string[], kind: SpotKindId): boolean {
  if (kind === "other") return classifySpotKind(name, types) === "other";
  const def = SPOT_KIND_DEFS[kind];
  const set = typedSet(types);
  return def.placeTypes.some((type) => set.has(normalizePlaceType(type)));
}

export function facetsFromWishText(text: string): WishFacet[] {
  return WISH_FACETS.filter((facet) => facet.wish.test(text));
}

export function kindsFromWishText(text: string): SpotKindId[] {
  const kinds: SpotKindId[] = [];
  const seen = new Set<SpotKindId>();
  for (const facet of facetsFromWishText(text)) {
    if (seen.has(facet.kind)) continue;
    seen.add(facet.kind);
    kinds.push(facet.kind);
    if (facet.id === "sweet_treat" && !seen.has("cafe")) {
      seen.add("cafe");
      kinds.push("cafe");
    }
  }
  return kinds;
}

export type SpotTypeSource = {
  name: string;
  categories?: readonly string[];
  types?: readonly string[];
  primaryType?: string | null;
};

export function typesOf(spot: SpotTypeSource): string[] {
  return placeTypeList(spot.primaryType, spot.types, spot.categories);
}

export function explainWishMatches(spot: SpotTypeSource, content: string): WishMatch[] {
  const types = typedSet(typesOf(spot));
  const matches: WishMatch[] = [];
  for (const facet of facetsFromWishText(content)) {
    const hit = intersectingTypes(types, facet.fulfillTypes);
    if (hit.length) {
      matches.push({
        facetId: facet.id,
        kind: facet.kind,
        confidence: "type",
        sourceTypes: hit,
        note: `希望「${facet.scoutCategory}」を Places type（${hit.join(", ")}）で満たした`,
      });
      continue;
    }
    if (facet.name.test(spot.name)) {
      matches.push({
        facetId: facet.id,
        kind: facet.kind,
        confidence: "name",
        sourceTypes: [],
        note: `希望「${facet.scoutCategory}」は名前からの推定。MUSTの根拠にはしない`,
      });
    }
  }
  return matches;
}

export function explainWishMatch(spot: SpotTypeSource, content: string): WishMatch | null {
  const matches = explainWishMatches(spot, content);
  return matches.find((item) => item.confidence === "type") ?? matches[0] ?? null;
}

export function spotMatchesWish(spot: SpotTypeSource, content: string): boolean {
  return explainWishMatches(spot, content).some((item) => item.confidence === "type");
}

export function spotFulfillsFacet(spot: SpotTypeSource, facetId: WishFacetId): boolean {
  const facet = WISH_FACETS.find((item) => item.id === facetId);
  if (!facet?.fulfillTypes.length) return false;
  return intersectingTypes(typedSet(typesOf(spot)), facet.fulfillTypes).length > 0;
}

/** Type-fulfillable facets mentioned in wish text (excludes 温泉 / ものづくり etc.). */
export function planningFacetsFromWish(text: string): WishFacetId[] {
  return facetsFromWishText(text)
    .filter((facet) => facet.fulfillTypes.length > 0)
    .map((facet) => facet.id);
}

export type SpotScoutJob = {
  kind: SpotKindId;
  facet?: WishFacetId;
  bucket: ScoutBucket;
  category: string;
  includedTypes: string[];
  rankPreference: "POPULARITY" | "DISTANCE";
};

function job(kind: Exclude<SpotKindId, "other">, over: Partial<SpotScoutJob> = {}): SpotScoutJob {
  const def = SPOT_KIND_DEFS[kind];
  return {
    kind,
    bucket: def.bucket,
    category: def.scoutCategory,
    includedTypes: [...def.searchTypes],
    rankPreference: def.rankPreference,
    ...over,
  };
}

function jobFromFacet(facet: WishFacet): SpotScoutJob {
  return {
    kind: facet.kind,
    facet: facet.id,
    bucket: facet.bucket,
    category: facet.scoutCategory,
    includedTypes: [...facet.searchTypes],
    rankPreference: facet.rankPreference,
  };
}

export const DEFAULT_SPOT_SCOUT_JOBS: SpotScoutJob[] = [
  job("nature", { category: "散策-公園" }),
  job("town", { category: "街-名所" }),
  job("museum", { category: "展示-博物館", includedTypes: ["museum"] }),
  job("museum", { category: "展示-美術館", includedTypes: ["art_gallery"], rankPreference: "DISTANCE" }),
  job("cafe", { category: "カフェ" }),
  job("sweets", { category: "スイーツ" }),
  job("shopping", { category: "買い物-書店", includedTypes: ["book_store", "bookstore"], rankPreference: "POPULARITY" }),
  job("shopping", { category: "買い物" }),
];

export const UNSUPPORTED_WISHES: { re: RegExp; label: string }[] = [
  { re: /ものづくり/, label: "ものづくり体験" },
];

function unsupportedFromFacets(facets: WishFacet[]): string[] {
  const labels: string[] = [];
  for (const facet of facets) {
    if (facet.fulfillTypes.length) continue;
    if (!labels.includes(facet.scoutCategory)) labels.push(facet.scoutCategory);
  }
  return labels;
}

export function scoutJobsFromWishes(text: string): { jobs: SpotScoutJob[]; unsupported: string[]; key: string } {
  const matched = facetsFromWishText(text);
  const unsupported = [
    ...UNSUPPORTED_WISHES.filter((item) => item.re.test(text)).map((item) => item.label),
    ...unsupportedFromFacets(matched),
  ].filter((label, index, all) => all.indexOf(label) === index);
  if (!text.trim() || (/おまかせ/.test(text) && !matched.length)) {
    return { jobs: DEFAULT_SPOT_SCOUT_JOBS, unsupported, key: "default" };
  }
  const jobs: SpotScoutJob[] = [];
  const seen = new Set<string>();
  for (const facet of matched) {
    // Places type で達成判定できない希望は、検索を回さず確認質問へ回す。
    if (!facet.fulfillTypes.length) continue;
    if (!facet.searchTypes.length || seen.has(facet.scoutCategory)) continue;
    seen.add(facet.scoutCategory);
    jobs.push(jobFromFacet(facet));
  }
  if (!jobs.length) {
    return { jobs: DEFAULT_SPOT_SCOUT_JOBS, unsupported, key: `default+${unsupported.join(",")}` };
  }
  return { jobs, unsupported, key: jobs.map((item) => item.category).join("|") };
}

export function includedTypesForCategory(category: string): string[] {
  const jobs = scoutJobsFromWishes(category);
  if (jobs.key !== "default" && jobs.jobs.length) {
    return placeTypeList(...jobs.jobs.map((item) => item.includedTypes));
  }
  const facets = facetsFromWishText(category);
  if (facets.length) return placeTypeList(...facets.map((facet) => facet.searchTypes));
  return ["tourist_attraction"];
}

export function searchTypesForWishText(text: string): string[] {
  const facets = facetsFromWishText(text);
  return placeTypeList(...facets.map((facet) => facet.searchTypes));
}
