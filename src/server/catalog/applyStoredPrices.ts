import { toTokyoParts } from "@/lib/time";
import type { Spot } from "@/domain/schemas";
import { budgetCeilingJpy, computeCostAccounting, isStaleFact } from "@/domain/price/accounting";
import { isLegacyPriceFact, listFactsForPlace } from "./priceRepo";

function isDiningSpot(spot: Spot): boolean {
  const cats = spot.categories.join(" ").toLowerCase();
  return /cafe|restaurant|food|bakery|meal|bar|izakaya|night_club|pub|wine_bar|喫茶|カフェ|レストラン|スイーツ|居酒屋|バー|酒場/.test(
    cats,
  );
}

/**
 * 収集済み公式単価を読み、コードで二人会計を計算する（LLM なし）。
 * 古い保存済みプランは呼ばない側で変更しないこと。
 */
export async function applyStoredPricesToSpot(
  spot: Spot,
  opts?: { dateTokyo?: string },
): Promise<Spot> {
  const facts = await listFactsForPlace(spot.id);
  const now = new Date().toISOString();
  const fresh = facts.filter(
    (f) => !isStaleFact(f, now) && f.confirmation !== "UNKNOWN" && !isLegacyPriceFact(f),
  );
  if (fresh.length === 0) {
    return spot;
  }

  const dateTokyo = opts?.dateTokyo ?? toTokyoParts(now).date;
  const weekday = toTokyoParts(`${dateTokyo}T12:00:00+09:00`).weekday;
  const dining = isDiningSpot(spot);
  const accounting = computeCostAccounting({
    facts: fresh,
    dateTokyo,
    weekday,
    partySize: 2,
    preferUsage: dining ? "DINING" : "PERMANENT",
    isDining: dining,
  });

  const ceiling = budgetCeilingJpy(accounting);
  const min = accounting.amountMinJpy;
  const max = accounting.amountMaxJpy;
  // costForTwoJpy は上限が確定しているときだけ埋める。下限のみは入れない。
  const costValue =
    accounting.status !== "UNKNOWN" && min != null && max != null && accounting.maxInclusive
      ? { min, max }
      : null;

  return {
    ...spot,
    costForTwoJpy: {
      value: costValue,
      evidenceIds: fresh.flatMap((f) => f.evidenceIds).slice(0, 8),
    },
    costAccounting: accounting,
    // Places 帯は残すが二人料金には使わない。
    placesPriceBand: spot.placesPriceBand ?? null,
  };
}

export { budgetCeilingJpy };
