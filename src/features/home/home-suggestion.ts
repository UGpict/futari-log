import type { PlaceCandidate } from "@/contracts";

/** ホーム提案カード用。LLM 生成ではなく UI 定数。PlanningInput 自体は変えない。 */
export type HomeSuggestion = {
  title: string;
  area: string;
  wish: string;
  /** 集合＝検索中心になる場所 */
  meetPlace: PlaceCandidate;
  startTime: string;
  endTime: string;
  /** カード上のルート表示（例: 美術館・展示 → 夜カフェ） */
  routeLabels: [string, string];
};

/**
 * 時間帯 15:00–21:00 の根拠:
 * - 美術館・展示は多くの場合 17–18 時閉館。開始を 15:00 にすれば滞在を閉館前に収める余地がある。
 * - 夜カフェは夕方以降が想定。終了 21:00 までで夜の滞在を含む。
 * - フォームの「夜から」(17:00–21:00) だと展示が閉店扱いになり落ちやすい（MOCK 再現で確認済み）。
 * - 「午後から」(13:00–18:00) だと夜カフェ帯が切れる。
 */
export const HOME_SUGGESTION: HomeSuggestion = {
  title: "アートと夜カフェ",
  area: "清澄白河",
  wish: "清澄白河で美術館や展示を楽しんだあと、夜カフェでゆっくり話すデートにしたい",
  meetPlace: {
    id: "seed:kiyosumi-shirakawa-station",
    name: "清澄白河駅",
    lat: 35.682163,
    lng: 139.798997,
    address: "東京都江東区清澄",
  },
  startTime: "15:00",
  endTime: "21:00",
  routeLabels: ["美術館・展示", "夜カフェ"],
};

/** PlanForm がセッション作成時に送るエリア／時間／希望の断片（契約フィールド名に合わせる）。 */
export function planningSeedFromHomeSuggestion(suggestion: HomeSuggestion) {
  return {
    wish: suggestion.wish,
    meet: suggestion.meetPlace,
    startTime: suggestion.startTime,
    endTime: suggestion.endTime,
    areaName: suggestion.meetPlace.name,
    areaLat: suggestion.meetPlace.lat,
    areaLng: suggestion.meetPlace.lng,
  };
}

export type PlanFormSeed = {
  wish?: string;
  meet?: PlaceCandidate;
  startTime?: string;
  endTime?: string;
};
