import type { SpotDto } from "@/contracts/session";

/** レイアウトを変えず、料金ラベルだけ差し替える。COST_UNKNOWN を黙って消さない。 */
export function spotCostLabel(spot: SpotDto | undefined | null): string {
  if (!spot) return "料金情報を確認できませんでした";
  const acc = spot.costAccounting;
  if (acc?.status === "CALCULATED" && acc.amountMaxJpy != null) {
    const base = `¥${acc.amountMaxJpy.toLocaleString()} / ふたり`;
    return acc.assumptionLabel ? `${base}（${acc.assumptionLabel}）` : base;
  }
  if (acc?.status === "ESTIMATED" && acc.amountMinJpy != null) {
    const range =
      acc.amountMaxJpy != null && acc.maxInclusive
        ? `¥${acc.amountMinJpy.toLocaleString()}〜${acc.amountMaxJpy.toLocaleString()}`
        : `¥${acc.amountMinJpy.toLocaleString()}〜`;
    return `${range}（${acc.assumptionLabel ?? "二人の目安"}）`;
  }
  if (acc?.note) return acc.note;
  if (spot.placesPriceBand) {
    return "Places の価格帯は単位不明のため二人料金にできません";
  }
  if (spot.costForTwoJpy.value) {
    // 旧データ: 人数未確認のまま入っている可能性があるので「確定」と呼ばない。
    if (spot.costForTwoJpy.value.max === 0 && spot.costForTwoJpy.value.min === 0) {
      return "料金情報を確認できませんでした";
    }
    return `¥${spot.costForTwoJpy.value.max.toLocaleString()}まで / ふたり（要再確認）`;
  }
  return "料金情報を確認できませんでした";
}

export function spotCostSourceNote(spot: SpotDto | undefined | null): string | null {
  if (!spot?.costAccounting?.confirmedAt) return null;
  const day = spot.costAccounting.confirmedAt.slice(0, 10);
  return `確認日 ${day}`;
}
