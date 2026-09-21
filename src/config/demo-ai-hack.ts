import type { PlaceCandidate } from "@/contracts";

/** 大会ネタ用。AI HACK サンプルからプランへ流し込む固定会場。 */
export const AI_HACK_VENUE = {
  spotId: "demo:tomoshibi-surugadai",
  label: "AI HACK 2026",
  place: {
    id: "demo:tomoshibi-surugadai",
    name: "燈株式会社オフィス",
    lat: 35.69955,
    lng: 139.76405,
    address: "〒101-0062 東京都千代田区神田駿河台4丁目6 21階",
  } satisfies PlaceCandidate,
  /** 会場でのハッカソン枠 */
  fixedStart: "10:00",
  fixedEnd: "16:00",
  /** デート全体（終わったあと飲み屋まで） */
  dayStart: "10:00",
  dayEnd: "21:00",
  wish: "神田駿河台の会場で日中のハッカソンのあと、17時ごろから近くの飲み屋で乾杯したい",
  areaWishToken: "神田駿河台",
} as const;

export function isAiHackDemoSpotId(id: string | null | undefined): boolean {
  return id === AI_HACK_VENUE.spotId;
}
