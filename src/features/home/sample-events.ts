/** ホーム「近くのイベント」大会用サンプル。表示専用 — カタログ selectedEventIds には入れない。 */

export type HomeSampleEvent = {
  id: `sample:${string}`;
  demo: true;
  dateLabel: string;
  area: string;
  title: string;
  kicker: string;
  theme: string;
  /** Plan seed: area + vibe only. Never pass sample id / event title / run dates into catalog. */
  planWish: string;
  /** Token expected inside planWish (for tests). */
  areaWishToken: string;
  meet: {
    id: string;
    name: string;
    lat: number;
    lng: number;
    address: string;
  };
  sponsored: boolean;
};

export const nearbySampleEvents: HomeSampleEvent[] = [
  {
    id: "sample:odd-exhibition",
    demo: true,
    dateLabel: "10/4まで（表示用）",
    area: "上野エリア",
    title: "ちょっと不思議なもの展",
    kicker: "会話が弾む、ユニークな企画展",
    theme: "exhibition",
    areaWishToken: "上野",
    planWish: "上野で展示とカフェを楽しむデートにしたい",
    meet: {
      id: "ChIJN7KqVVyMGGARxaTwIeyZ2nQ",
      name: "上野駅",
      lat: 35.714165,
      lng: 139.777409,
      address: "東京都台東区",
    },
    sponsored: false,
  },
  {
    id: "sample:night-garden",
    demo: true,
    dateLabel: "9/23–10/4（表示用）",
    area: "清澄白河エリア",
    title: "夜の庭園ライトアップ",
    kicker: "秋の夜を、ゆっくり散歩",
    theme: "garden",
    areaWishToken: "清澄白河",
    planWish: "清澄白河で庭園さんぽとカフェのデートにしたい",
    meet: {
      id: "ChIJaX6cwT2JGGARKz3KrG7DRWU",
      name: "清澄白河駅",
      lat: 35.682163,
      lng: 139.798997,
      address: "東京都江東区清澄",
    },
    sponsored: false,
  },
  {
    id: "sample:mystery-walk",
    demo: true,
    dateLabel: "9/27まで（表示用）",
    area: "下北沢・三軒茶屋",
    title: "ふたりで巡る、まち歩き謎解き",
    kicker: "寄り道しながら小さな謎を解こう",
    theme: "mystery",
    areaWishToken: "下北沢",
    planWish: "下北沢でまち歩きとカフェのデートにしたい",
    meet: {
      id: "ChIJM2EpmmvzGGARXV5tNZ86xGY",
      name: "下北沢駅",
      lat: 35.6615848,
      lng: 139.6668918,
      address: "東京都世田谷区",
    },
    sponsored: true,
  },
  {
    id: "sample:ai-hack",
    demo: true,
    dateLabel: "9/19–9/23（表示用）",
    area: "東京駅周辺",
    title: "AI HACK 2026",
    kicker: "賞金最大100万円、5日間のAIハッカソン",
    theme: "ai-hack",
    areaWishToken: "東京駅",
    planWish: "東京駅周辺でテクノロジーを楽しむ屋内デートにしたい",
    meet: {
      id: "ChIJC3Cf2PuLGGAROO00ukl8JwA",
      name: "東京駅",
      lat: 35.681236,
      lng: 139.767125,
      address: "東京都千代田区",
    },
    sponsored: false,
  },
];
