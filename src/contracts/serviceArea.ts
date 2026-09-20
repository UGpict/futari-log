import type { TravelMode } from "./planning";
import { SPOT_KIND_DEFS, type SpotKindId, type SpotScoutJob } from "./spotKinds";

export const SERVICE_AREA_LABEL = "東京都内";
export const SERVICE_AREA_NOTICE = "現在は東京都内に対応しています";

export const TOKYO_PRIORITY_AREAS = [
  { name: "東京駅・丸の内", lat: 35.681236, lng: 139.767125 },
  { name: "上野", lat: 35.713768, lng: 139.777254 },
  { name: "浅草", lat: 35.711776, lng: 139.796655 },
  { name: "渋谷・原宿", lat: 35.658034, lng: 139.701636 },
  { name: "新宿", lat: 35.689606, lng: 139.700571 },
  { name: "池袋", lat: 35.729503, lng: 139.7109 },
  { name: "お台場", lat: 35.627019, lng: 139.779984 },
] as const;

export const SEARCH_EXPAND = {
  WALK: { initialMeters: 1200, stepMeters: 800, maxMeters: 3000, maxRounds: 3 },
  TRANSIT: { initialMeters: 2000, stepMeters: 2000, maxMeters: 6000, maxRounds: 3 },
  DRIVE: { initialMeters: 2500, stepMeters: 2000, maxMeters: 8000, maxRounds: 3 },
} as const;

export type SearchExpandConfig = (typeof SEARCH_EXPAND)[TravelMode];

const TOKYO_BOX = { minLat: 35.52, maxLat: 35.9, minLng: 139.02, maxLng: 139.92 };

const TOKYO_NAME = /東京都|東京駅|丸の内|上野|浅草|渋谷|原宿|新宿|池袋|お台場|千代田区|中央区|港区|文京区|台東区|墨田区|江東区|品川区|目黒区|大田区|世田谷区|中野区|杉並区|豊島区|北区|荒川区|板橋区|練馬区|足立区|葛飾区|江戸川区|八王子|立川|武蔵野|三鷹|調布|府中|町田/;
const OUTSIDE_NAME = /名古屋|大阪|京都|福岡|札幌|横浜駅|大宮|千葉市|埼玉|神奈川県|愛知県|大阪府|京都府/;

export type AreaVerdict = "inside" | "outside" | "unknown";

export type AreaPoint = {
  name: string;
  lat: number;
  lng: number;
  address?: string | null;
};

export function inTokyoBox(lat: number, lng: number): boolean {
  return lat >= TOKYO_BOX.minLat && lat <= TOKYO_BOX.maxLat && lng >= TOKYO_BOX.minLng && lng <= TOKYO_BOX.maxLng;
}

export function assessTokyoPoint(point: AreaPoint): AreaVerdict {
  const blob = `${point.name} ${point.address ?? ""}`;
  if (/東京都/.test(point.address ?? "")) return "inside";
  if (/[都道府県]/.test(point.address ?? "") && !/東京都/.test(point.address ?? "")) return "outside";
  if (OUTSIDE_NAME.test(blob) && !TOKYO_NAME.test(blob)) return "outside";
  if (TOKYO_NAME.test(blob) && !OUTSIDE_NAME.test(blob)) return "inside";
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return "unknown";
  if (inTokyoBox(point.lat, point.lng)) return "inside";
  return "outside";
}

export function assessTokyoPlan(points: AreaPoint[]): {
  verdict: AreaVerdict;
  outside: AreaPoint[];
  unknown: AreaPoint[];
} {
  const verdicts = points.map((point) => ({ point, verdict: assessTokyoPoint(point) }));
  const outside = verdicts.filter((item) => item.verdict === "outside").map((item) => item.point);
  const unknown = verdicts.filter((item) => item.verdict === "unknown").map((item) => item.point);
  if (outside.length) return { verdict: "outside", outside, unknown };
  if (unknown.length) return { verdict: "unknown", outside, unknown };
  return { verdict: "inside", outside, unknown };
}

export function searchRadiiFor(mode: TravelMode, opts?: { expand?: boolean }): number[] {
  const cfg = SEARCH_EXPAND[mode];
  if (opts?.expand === false) return [cfg.initialMeters];
  const radii: number[] = [cfg.initialMeters];
  for (let round = 1; round < cfg.maxRounds; round += 1) {
    const next =
      round === cfg.maxRounds - 1
        ? cfg.maxMeters
        : Math.min(cfg.initialMeters + round * cfg.stepMeters, cfg.maxMeters);
    if (!radii.includes(next)) radii.push(next);
    if (next >= cfg.maxMeters) break;
  }
  return radii;
}

export function wantsSameKindTour(text: string): boolean {
  return /巡り|めぐり|はしご|何軒|カフェ巡り/.test(text);
}

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

export function companionScoutJobs(jobs: SpotScoutJob[], text: string): SpotScoutJob[] {
  if (wantsSameKindTour(text)) return [];
  const kinds = new Set(jobs.map((item) => item.kind));
  const extras: SpotScoutJob[] = [];
  const add = (next: SpotScoutJob) => {
    if (kinds.has(next.kind) || extras.some((item) => item.kind === next.kind)) return;
    extras.push(next);
  };
  if (kinds.has("cafe") || kinds.has("sweets") || kinds.has("dining")) {
    add(job("museum", { category: "展示", includedTypes: ["museum", "art_gallery"] }));
    add(job("nature", { category: "散策-公園", includedTypes: ["park"] }));
  }
  if (kinds.has("museum")) add(job("cafe"));
  if (kinds.has("aquarium")) add(job("dining"));
  if (kinds.has("nature")) add(job("cafe"));
  if (kinds.has("cinema")) add(job("cafe"));
  if (kinds.has("shopping")) add(job("cafe"));
  return extras.slice(0, 2);
}

export function outsideTokyoQuestion(names: string[]) {
  return {
    id: "q_outside_tokyo",
    prompt: `${SERVICE_AREA_NOTICE}。いま選ばれている「${names.join("、")}」は都外と判断しました。集合・解散・固定予定を都内に変えてください。場所は置き換えていません。`,
    options: ["場所を選び直す", "中断する"],
  };
}

export function tokyoUnconfirmedQuestion(names: string[]) {
  return {
    id: "q_tokyo_unconfirmed",
    prompt: `${SERVICE_AREA_NOTICE}。「${names.join("、")}」が都内かどうか確認できませんでした。都内の場所なら続けます。黙って別の地点にはしません。`,
    options: ["都内の場所です", "場所を選び直す"],
  };
}

export function searchRangeQuestion(radiusMeters: number) {
  return {
    id: "q_search_range",
    prompt: `近い範囲では希望に合う実在候補が足りませんでした（最大 ${Math.round(radiusMeters / 1000)}km まで探しました）。条件を変えますか？検証は緩めていません。`,
    options: ["この範囲で続ける", "条件を変える", "中断する"],
  };
}
