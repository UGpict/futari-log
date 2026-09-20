export type ScoutBucket = "walk" | "exhibit" | "sweets" | "other";

export type ScoutJob = {
  bucket: ScoutBucket;
  category: string;
  includedTypes: string[];
  rankPreference: "POPULARITY" | "DISTANCE";
};

export const DEFAULT_SCOUT_JOBS: ScoutJob[] = [
  { bucket: "walk", category: "散歩-公園", includedTypes: ["park"], rankPreference: "DISTANCE" },
  { bucket: "walk", category: "散歩-名所", includedTypes: ["tourist_attraction"], rankPreference: "POPULARITY" },
  { bucket: "exhibit", category: "展示-博物館", includedTypes: ["museum"], rankPreference: "POPULARITY" },
  { bucket: "exhibit", category: "展示-美術館", includedTypes: ["art_gallery"], rankPreference: "DISTANCE" },
  { bucket: "sweets", category: "甘味-カフェ", includedTypes: ["cafe"], rankPreference: "DISTANCE" },
  { bucket: "sweets", category: "甘味-菓子", includedTypes: ["bakery"], rankPreference: "POPULARITY" },
  { bucket: "other", category: "寄り道-書店", includedTypes: ["bookstore"], rankPreference: "POPULARITY" },
  { bucket: "other", category: "寄り道-買い物", includedTypes: ["shopping_mall"], rankPreference: "DISTANCE" },
];

const TOKEN_JOBS: { re: RegExp; job: ScoutJob }[] = [
  { re: /公園|散歩|ピクニック/, job: { bucket: "walk", category: "散歩-公園", includedTypes: ["park"], rankPreference: "DISTANCE" } },
  { re: /海|ビーチ/, job: { bucket: "walk", category: "散歩-海", includedTypes: ["beach"], rankPreference: "DISTANCE" } },
  { re: /展示|美術館|博物館|アート/, job: { bucket: "exhibit", category: "展示-美術館", includedTypes: ["art_gallery", "museum"], rankPreference: "POPULARITY" } },
  { re: /カフェ|甘い|スイーツ|ケーキ/, job: { bucket: "sweets", category: "甘味-カフェ", includedTypes: ["cafe"], rankPreference: "DISTANCE" } },
  { re: /食べ|食事|おいしい|お肉|寿司|イタリアン|レストラン/, job: { bucket: "other", category: "食事-レストラン", includedTypes: ["restaurant"], rankPreference: "POPULARITY" } },
  { re: /温泉|湯/, job: { bucket: "other", category: "のんびり-温泉", includedTypes: ["spa"], rankPreference: "DISTANCE" } },
  { re: /水族館/, job: { bucket: "exhibit", category: "遊び-水族館", includedTypes: ["aquarium"], rankPreference: "POPULARITY" } },
  { re: /映画/, job: { bucket: "other", category: "遊び-映画", includedTypes: ["movie_theater"], rankPreference: "DISTANCE" } },
  { re: /動物園/, job: { bucket: "exhibit", category: "遊び-動物園", includedTypes: ["zoo"], rankPreference: "POPULARITY" } },
  { re: /遊園地/, job: { bucket: "other", category: "遊び-遊園地", includedTypes: ["amusement_park"], rankPreference: "POPULARITY" } },
  { re: /買い物|ショッピング|雑貨/, job: { bucket: "other", category: "寄り道-買い物", includedTypes: ["shopping_mall"], rankPreference: "DISTANCE" } },
  { re: /本屋|書店/, job: { bucket: "other", category: "寄り道-書店", includedTypes: ["bookstore"], rankPreference: "POPULARITY" } },
];

const UNSUPPORTED: { re: RegExp; label: string }[] = [
  { re: /ものづくり/, label: "ものづくり体験" },
];

export function scoutJobsForPreferences(
  preferences: { content: string; priority?: string }[],
): { jobs: ScoutJob[]; unsupported: string[]; key: string } {
  const text = preferences.map((p) => p.content).join("。");
  const unsupported = UNSUPPORTED.filter((item) => item.re.test(text)).map((item) => item.label);
  if (!text.trim() || (/おまかせ/.test(text) && !TOKEN_JOBS.some((t) => t.re.test(text)))) {
    return { jobs: DEFAULT_SCOUT_JOBS, unsupported, key: "default" };
  }
  const jobs: ScoutJob[] = [];
  const seen = new Set<string>();
  for (const { re, job } of TOKEN_JOBS) {
    if (!re.test(text) || seen.has(job.category)) continue;
    seen.add(job.category);
    jobs.push(job);
  }
  if (!jobs.length) {
    return { jobs: DEFAULT_SCOUT_JOBS, unsupported, key: `default+${unsupported.join(",")}` };
  }
  return { jobs, unsupported, key: jobs.map((j) => j.category).join("|") };
}
