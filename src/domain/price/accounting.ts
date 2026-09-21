import type { CostAccounting, OfficialPriceFact, PlacesPriceBand } from "@/contracts/price";
import { placesPriceBandSchema, costAccountingSchema, officialPriceFactSchema } from "@/contracts/price";

export type ParsedPlacesYen = {
  band: PlacesPriceBand;
} | null;

/**
 * Places priceRange → 単位不明の価格帯。二人料金にはしない。
 * start のみ: max=null（min=max にしない）。end のみ: min=null。
 * 非 JPY / 欠測 → null（0 円にしない）。
 */
export function parsePlacesPriceBand(
  raw:
    | {
        startPrice?: { currencyCode?: string; units?: string };
        endPrice?: { currencyCode?: string; units?: string };
      }
    | null
    | undefined,
): ParsedPlacesYen {
  if (!raw) return null;
  const currencies = [raw.startPrice?.currencyCode, raw.endPrice?.currencyCode].filter(
    (c): c is string => Boolean(c),
  );
  if (currencies.length === 0) return null;
  if (currencies.some((c) => c !== "JPY")) return null;
  const minRaw = raw.startPrice?.units != null ? Number(raw.startPrice.units) : NaN;
  const maxRaw = raw.endPrice?.units != null ? Number(raw.endPrice.units) : NaN;
  const minJpy = Number.isFinite(minRaw) ? minRaw : null;
  const maxJpy = Number.isFinite(maxRaw) ? maxRaw : null;
  if (minJpy == null && maxJpy == null) return null;
  return {
    band: {
      minJpy,
      maxJpy,
      maxInclusive: maxJpy != null,
      unitUnknown: true,
      source: "places.priceRange",
    },
  };
}

/** @deprecated 互換。二人料金用には使わない。 */
export function parseYenRange(
  raw:
    | {
        startPrice?: { currencyCode?: string; units?: string };
        endPrice?: { currencyCode?: string; units?: string };
      }
    | null
    | undefined,
): { min: number; max: number } | null {
  const parsed = parsePlacesPriceBand(raw);
  if (!parsed) return null;
  // 旧挙動のテスト移行用。新規経路は parsePlacesPriceBand を使う。
  const { minJpy, maxJpy } = parsed.band;
  if (minJpy != null && maxJpy != null) return { min: minJpy, max: maxJpy };
  return null;
}

export type ComputeCostInput = {
  facts: OfficialPriceFact[];
  dateTokyo: string;
  weekday: number;
  partySize: number;
  preferUsage: OfficialPriceFact["usageKind"];
  isDining: boolean;
};

function factApplies(fact: OfficialPriceFact, input: ComputeCostInput): boolean {
  if (fact.confirmation === "UNKNOWN") return false;
  if (fact.dateStart && input.dateTokyo < fact.dateStart) return false;
  if (fact.dateEnd && input.dateTokyo > fact.dateEnd) return false;
  if (fact.weekdays && fact.weekdays.length > 0 && !fact.weekdays.includes(input.weekday)) {
    return false;
  }
  return true;
}

function unitAmount(fact: OfficialPriceFact): number | null {
  if (fact.amountMinJpy == null && fact.amountMaxJpy == null) return null;
  // 計算は確認済み単価。幅がある場合は min/max を人数倍する。
  return fact.amountMinJpy ?? fact.amountMaxJpy;
}

/**
 * 施設: 適用条件が合う一人単価 × 人数 → CALCULATED（仮定を明示）。
 * 飲食: メニュー単価 + 注文仮定 → ESTIMATED。
 * 公式単価 VERIFIED でも注文仮定があれば会計は ESTIMATED。
 */
export function computeCostAccounting(input: ComputeCostInput): CostAccounting {
  const applicable = input.facts.filter((f) => factApplies(f, input));
  const unknownLabels: string[] = [];

  if (input.isDining) {
    const drinks = applicable.filter(
      (f) =>
        f.kind === "MENU_ITEM" &&
        f.unit === "PER_ITEM" &&
        /ドリンク|coffee|tea|飲料|カフェ/i.test(`${f.quote ?? ""}`),
    );
    const sweets = applicable.filter(
      (f) =>
        f.kind === "MENU_ITEM" &&
        f.unit === "PER_ITEM" &&
        /スイーツ|ケーキ|パフェ|デザート|甜/i.test(`${f.quote ?? ""}`),
    );
    const drink = drinks.sort((a, b) => (a.amountMinJpy ?? 0) - (b.amountMinJpy ?? 0))[0];
    const sweet = sweets.sort((a, b) => (a.amountMinJpy ?? 0) - (b.amountMinJpy ?? 0))[0];
    if (!drink || !sweet || drink.amountMinJpy == null || sweet.amountMinJpy == null) {
      if (!drink) unknownLabels.push("ドリンク単価");
      if (!sweet) unknownLabels.push("スイーツ単価");
      return {
        status: "UNKNOWN",
        assumptionLabel: null,
        amountMinJpy: null,
        amountMaxJpy: null,
        maxInclusive: false,
        breakdown: [],
        sourceUrl: drink?.sourceUrl ?? sweet?.sourceUrl ?? null,
        confirmedAt: null,
        note: "料金情報を確認できませんでした",
        knownSubtotalJpy: null,
        unknownLabels,
      };
    }
    const perPerson = drink.amountMinJpy + sweet.amountMinJpy;
    const total = perPerson * input.partySize;
    const drinkMax = drink.amountMaxJpy ?? drink.amountMinJpy;
    const sweetMax = sweet.amountMaxJpy ?? sweet.amountMinJpy;
    const totalMax = (drinkMax + sweetMax) * input.partySize;
    return {
      status: "ESTIMATED",
      assumptionLabel: `二人の目安／各1ドリンク＋スイーツを想定`,
      amountMinJpy: total,
      amountMaxJpy: totalMax,
      maxInclusive: drink.maxInclusive && sweet.maxInclusive,
      breakdown: [
        { label: `ドリンク ×${input.partySize}`, amountJpy: drink.amountMinJpy * input.partySize, factId: drink.id },
        { label: `スイーツ ×${input.partySize}`, amountJpy: sweet.amountMinJpy * input.partySize, factId: sweet.id },
      ],
      sourceUrl: drink.sourceUrl ?? sweet.sourceUrl,
      confirmedAt: drink.fetchedAt,
      note: "注文の仮定に基づく概算。確定額・上限保証ではない",
      knownSubtotalJpy: total,
      unknownLabels: [],
    };
  }

  const usage =
    applicable.find(
      (f) =>
        f.usageKind === input.preferUsage &&
        f.unit === "PER_PERSON" &&
        f.audience === "GENERAL" &&
        (f.kind === "ADMISSION" || f.kind === "SPECIAL_EXHIBITION" || f.kind === "OTHER"),
    ) ??
    applicable.find(
      (f) =>
        f.unit === "PER_PERSON" &&
        f.audience === "GENERAL" &&
        f.usageKind === "PERMANENT" &&
        f.kind === "ADMISSION",
    );

  if (!usage) {
    return {
      status: "UNKNOWN",
      assumptionLabel: null,
      amountMinJpy: null,
      amountMaxJpy: null,
      maxInclusive: false,
      breakdown: [],
      sourceUrl: null,
      confirmedAt: null,
      note: "料金情報を確認できませんでした",
      knownSubtotalJpy: null,
      unknownLabels: ["適用可能な公式単価"],
    };
  }

  if (usage.unit === "UNKNOWN" || usage.kind === "PLACES_BAND") {
    return {
      status: "UNKNOWN",
      assumptionLabel: null,
      amountMinJpy: null,
      amountMaxJpy: null,
      maxInclusive: false,
      breakdown: [],
      sourceUrl: usage.sourceUrl,
      confirmedAt: usage.fetchedAt,
      note: "単位が不明な価格帯のため二人料金にはしません",
      knownSubtotalJpy: null,
      unknownLabels: ["人数単位"],
    };
  }

  const unitMin = usage.amountMinJpy;
  const unitMax = usage.amountMaxJpy;
  if (unitMin == null && unitMax == null) {
    return {
      status: "UNKNOWN",
      assumptionLabel: null,
      amountMinJpy: null,
      amountMaxJpy: null,
      maxInclusive: false,
      breakdown: [],
      sourceUrl: usage.sourceUrl,
      confirmedAt: usage.fetchedAt,
      note: "料金情報を確認できませんでした",
      knownSubtotalJpy: null,
      unknownLabels: ["金額"],
    };
  }

  const usageLabel =
    usage.usageKind === "PERMANENT"
      ? "常設展"
      : usage.usageKind === "SPECIAL_EXHIBITION"
        ? "企画展"
        : usage.usageKind === "GARDEN"
          ? "入園"
          : "利用";
  const assumptionLabel = `一般${input.partySize}名・${usageLabel}`;
  const min = unitMin != null ? unitMin * input.partySize : null;
  const max = unitMax != null ? unitMax * input.partySize : null;
  const status =
    usage.confirmation === "VERIFIED" && unitMin != null && unitMax != null && usage.maxInclusive
      ? "CALCULATED"
      : "ESTIMATED";

  return {
    status,
    assumptionLabel,
    amountMinJpy: min,
    amountMaxJpy: max,
    maxInclusive: max != null && usage.maxInclusive,
    breakdown: [
      {
        label: `${usageLabel}（一人）×${input.partySize}`,
        amountJpy: min,
        factId: usage.id,
      },
    ],
    sourceUrl: usage.sourceUrl,
    confirmedAt: usage.fetchedAt,
    note:
      status === "CALCULATED"
        ? null
        : max == null
          ? "上限が不明です。下限のみでは予算上限判定に使いません"
          : "条件付きの概算です",
    knownSubtotalJpy: min,
    unknownLabels: max == null ? ["上限"] : [],
  };
}

/** 予算上限判定: max が無い・非 inclusive・ESTIMATED のみ下限 → 上限として使わない。 */
export function budgetCeilingJpy(accounting: CostAccounting | null | undefined): number | null {
  if (!accounting) return null;
  if (accounting.amountMaxJpy == null) return null;
  if (!accounting.maxInclusive) return null;
  if (accounting.status === "UNKNOWN") return null;
  return accounting.amountMaxJpy;
}

export function isStaleFact(fact: OfficialPriceFact, nowIso: string): boolean {
  if (!fact.revalidateBy) return false;
  return nowIso.slice(0, 10) > fact.revalidateBy.slice(0, 10);
}

export {
  placesPriceBandSchema,
  costAccountingSchema,
  officialPriceFactSchema,
};
