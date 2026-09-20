/** クライアントに出してよい公開設定。秘密・Admin・LLM キーは置かない。 */

export { SERVICE_AREA_NOTICE } from "@/contracts/serviceArea";

export const TIME_ZONE = "Asia/Tokyo";

export const FX = {
  usdJpy: 148.5,
  asOf: "2026-09-01",
  note: "アプリ設定の固定換算。日次相場ではない",
} as const;

export function tokyoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatYen(jpy: number | null): string {
  if (jpy == null) return "換算不能";
  if (jpy === 0) return "¥0";
  if (jpy > 0 && jpy < 1) return "¥1未満";
  if (jpy < 0 && jpy > -1) return "-¥1未満";
  return `¥${Math.round(jpy)}`;
}
