process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  budgetCeilingJpy,
  computeCostAccounting,
  parsePlacesPriceBand,
  parseYenRange,
} from "../src/domain/price/accounting";
import type { OfficialPriceFact } from "../src/contracts/price";
import {
  extractPriceCandidatesFromText,
  extractSameOriginFeeLinks,
  officialPageTrusted,
} from "../src/server/catalog/priceEnrich";
import { stableFactId, legacyStableFactId, isLegacyPriceFact } from "../src/server/catalog/priceRepo";
import { spotCostLabel } from "../src/features/session/cost-label";
import { sessionAllowsPriceReapply } from "../src/server/agent/place";

function fact(partial: Partial<OfficialPriceFact> & Pick<OfficialPriceFact, "id" | "kind" | "unit">): OfficialPriceFact {
  return {
    placeId: "ChIJ_test",
    venueName: "テスト館",
    amountMinJpy: 500,
    amountMaxJpy: 500,
    maxInclusive: true,
    currency: "JPY",
    audience: "GENERAL",
    usageKind: "PERMANENT",
    weekdays: [],
    timeStart: null,
    timeEnd: null,
    dateStart: null,
    dateEnd: null,
    exclusionNote: null,
    tax: "UNKNOWN",
    extraFeesUnknown: true,
    confirmation: "VERIFIED",
    sourceUrl: "https://example.com/fee",
    quote: "一般 500円",
    fetchedAt: "2026-09-21T00:00:00.000Z",
    revalidateBy: "2026-10-21",
    evidenceIds: ["pev_1"],
    branchMatch: "OFFICIAL_URL",
    ...partial,
  };
}

describe("price enrichment accounting", () => {
  it("does not put unit-unknown Places bands into two-person yen via parseYenRange", () => {
    const bandOnly = parsePlacesPriceBand({
      startPrice: { currencyCode: "JPY", units: "1000" },
      endPrice: { currencyCode: "JPY", units: "2000" },
    });
    assert.ok(bandOnly);
    assert.equal(bandOnly.band.unitUnknown, true);
    // 完全レンジでも二人料金用 parseYenRange は互換で返すことがあるが、
    // liveDetails は costForTwo に入れない。下限のみは null。
    assert.equal(
      parseYenRange({ startPrice: { currencyCode: "JPY", units: "1000" } }),
      null,
    );
  });

  it("does not treat min-only as a budget ceiling", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "f1",
          kind: "ADMISSION",
          unit: "PER_PERSON",
          amountMinJpy: 500,
          amountMaxJpy: null,
          maxInclusive: false,
          confirmation: "PARTIAL",
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "PERMANENT",
      isDining: false,
    });
    assert.equal(accounting.amountMinJpy, 1000);
    assert.equal(accounting.amountMaxJpy, null);
    assert.equal(budgetCeilingJpy(accounting), null);
  });

  it("does not invent 0 yen for missing amounts", () => {
    const accounting = computeCostAccounting({
      facts: [],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "PERMANENT",
      isDining: false,
    });
    assert.equal(accounting.status, "UNKNOWN");
    assert.equal(accounting.amountMinJpy, null);
    assert.equal(accounting.amountMaxJpy, null);
    assert.match(accounting.note ?? "", /確認できませんでした/);
  });

  it("computes two-person admission from per-person official price", () => {
    const accounting = computeCostAccounting({
      facts: [fact({ id: "f1", kind: "ADMISSION", unit: "PER_PERSON", amountMinJpy: 500, amountMaxJpy: 500 })],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "PERMANENT",
      isDining: false,
    });
    assert.equal(accounting.status, "CALCULATED");
    assert.equal(accounting.amountMinJpy, 1000);
    assert.equal(accounting.amountMaxJpy, 1000);
    assert.match(accounting.assumptionLabel ?? "", /一般2名/);
  });

  it("does not apply permanent admission as special exhibition", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "f1",
          kind: "ADMISSION",
          unit: "PER_PERSON",
          usageKind: "PERMANENT",
          amountMinJpy: 500,
          amountMaxJpy: 500,
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "SPECIAL_EXHIBITION",
      isDining: false,
    });
    // Prefer special; falls back to permanent with assumption label 常設展
    assert.ok(accounting.assumptionLabel?.includes("常設展"));
  });

  it("keeps weekday-limited menu items off weekends", () => {
    const weekdayDrink = fact({
      id: "f1",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      usageKind: "DINING",
      weekdays: [1, 2, 3, 4, 5],
      amountMinJpy: 600,
      amountMaxJpy: 600,
      quote: "平日限定ドリンク 600円",
    });
    const weekdaySweet = fact({
      id: "f2",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      usageKind: "DINING",
      weekdays: [1, 2, 3, 4, 5],
      amountMinJpy: 800,
      amountMaxJpy: 800,
      quote: "平日限定スイーツ 800円",
    });
    const sat = computeCostAccounting({
      facts: [weekdayDrink, weekdaySweet],
      dateTokyo: "2026-09-19",
      weekday: 6,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(sat.status, "UNKNOWN");
  });

  it("matches dining estimate breakdown to order assumption", () => {
    const drink = fact({
      id: "d1",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      usageKind: "DINING",
      amountMinJpy: 600,
      amountMaxJpy: 600,
      quote: "ブレンドコーヒー ドリンク 600円",
      confirmation: "VERIFIED",
    });
    const sweet = fact({
      id: "s1",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      usageKind: "DINING",
      amountMinJpy: 800,
      amountMaxJpy: 800,
      quote: "チーズケーキ スイーツ 800円",
      confirmation: "VERIFIED",
    });
    const accounting = computeCostAccounting({
      facts: [drink, sweet],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.status, "ESTIMATED");
    assert.equal(accounting.amountMinJpy, 2800);
    assert.equal(accounting.breakdown.reduce((s, l) => s + (l.amountJpy ?? 0), 0), 2800);
    assert.match(accounting.assumptionLabel ?? "", /ドリンク/);
  });

  it("keeps accounting ESTIMATED when official unit is VERIFIED but order is assumed", () => {
    const drink = fact({
      id: "d1",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      usageKind: "DINING",
      amountMinJpy: 500,
      amountMaxJpy: 500,
      quote: "ドリンク 500円",
      confirmation: "VERIFIED",
    });
    const sweet = fact({
      id: "s1",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      usageKind: "DINING",
      amountMinJpy: 700,
      amountMaxJpy: 700,
      quote: "スイーツ 700円",
      confirmation: "VERIFIED",
    });
    const accounting = computeCostAccounting({
      facts: [drink, sweet],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(drink.confirmation, "VERIFIED");
    assert.equal(accounting.status, "ESTIMATED");
  });

  it("dedupes fact ids for the same place+kind+source+amount+quote", () => {
    const a = stableFactId({
      placeId: "ChIJ_x",
      kind: "ADMISSION",
      unit: "PER_PERSON",
      audience: "GENERAL",
      usageKind: "PERMANENT",
      sourceUrl: "https://example.com",
      amountMinJpy: 500,
      quote: "一般 500円",
    });
    const b = stableFactId({
      placeId: "ChIJ_x",
      kind: "ADMISSION",
      unit: "PER_PERSON",
      audience: "GENERAL",
      usageKind: "PERMANENT",
      sourceUrl: "https://example.com",
      amountMinJpy: 500,
      quote: "一般 500円",
    });
    assert.equal(a, b);
  });

  it("keeps distinct fact ids when amounts differ on the same source page", () => {
    const a = stableFactId({
      placeId: "ChIJ_x",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      audience: "GENERAL",
      usageKind: "DINING",
      sourceUrl: "https://example.com/menu",
      amountMinJpy: 480,
      quote: "焼き鳥 480円",
    });
    const b = stableFactId({
      placeId: "ChIJ_x",
      kind: "MENU_ITEM",
      unit: "PER_ITEM",
      audience: "GENERAL",
      usageKind: "DINING",
      sourceUrl: "https://example.com/menu",
      amountMinJpy: 680,
      quote: "刺身 680円",
    });
    assert.notEqual(a, b);
  });

  it("detects legacy fact ids that omit amount from the key", () => {
    const legacyId = legacyStableFactId({
      placeId: "ChIJ_x",
      kind: "ADMISSION",
      unit: "PER_PERSON",
      audience: "GENERAL",
      usageKind: "PERMANENT",
      sourceUrl: "https://example.com",
    });
    const currentId = stableFactId({
      placeId: "ChIJ_x",
      kind: "ADMISSION",
      unit: "PER_PERSON",
      audience: "GENERAL",
      usageKind: "PERMANENT",
      sourceUrl: "https://example.com",
      amountMinJpy: 500,
      quote: "一般 500円",
    });
    assert.notEqual(legacyId, currentId);
    assert.equal(
      isLegacyPriceFact({
        id: legacyId,
        placeId: "ChIJ_x",
        kind: "ADMISSION",
        unit: "PER_PERSON",
        audience: "GENERAL",
        usageKind: "PERMANENT",
        sourceUrl: "https://example.com",
        amountMinJpy: 500,
        quote: "一般 500円",
      }),
      true,
    );
    assert.equal(
      isLegacyPriceFact({
        id: currentId,
        placeId: "ChIJ_x",
        kind: "ADMISSION",
        unit: "PER_PERSON",
        audience: "GENERAL",
        usageKind: "PERMANENT",
        sourceUrl: "https://example.com",
        amountMinJpy: 500,
        quote: "一般 500円",
      }),
      false,
    );
  });

  it("extracts admission yen from page body quotes", () => {
    const rows = extractPriceCandidatesFromText(
      "常設展 一般料金は500円です。別途企画展あり。",
      "https://example.com/fee",
    );
    assert.ok(rows.some((r) => r.amountMinJpy === 500 && r.unit === "PER_PERSON"));
  });

  it("UI label does not hide COST_UNKNOWN", () => {
    const label = spotCostLabel({
      id: "x",
      name: "x",
      lat: 0,
      lng: 0,
      categories: [],
      environment: { value: null, evidenceIds: [] },
      costForTwoJpy: { value: null, evidenceIds: [] },
      officialUrl: null,
      costAccounting: {
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
        unknownLabels: [],
      },
    });
    assert.match(label, /確認できませんでした/);
  });

  it("extracts course / nomihodai / tax-included patterns", () => {
    const rows = extractPriceCandidatesFromText(
      "飲み放題 2980円（税込）。コース 4500円。ランチ 1200円。焼き鳥 480円 メニュー。刺身 680円（税込）。",
      "https://example.com/menu",
    );
    assert.ok(rows.some((r) => r.kind === "SET_MENU" && r.amountMinJpy === 2980 && /飲み放題/.test(r.quote ?? "")));
    assert.ok(rows.some((r) => r.kind === "SET_MENU" && r.amountMinJpy === 4500 && /コース/.test(r.quote ?? "")));
    assert.ok(rows.some((r) => r.kind === "SET_MENU" && r.amountMinJpy === 1200 && /ランチ/.test(r.quote ?? "")));
    assert.ok(rows.some((r) => r.kind === "MENU_ITEM" && r.amountMinJpy === 480));
    assert.ok(rows.some((r) => r.tax === "INCLUDED" && r.amountMinJpy === 2980));
  });

  it("extracts nomihodai with duration like （120分）", () => {
    const rows = extractPriceCandidatesFromText(
      "飲み放題（120分） 1,650円（税込）。コース料理 4,500円。",
      "https://example.com/menu",
    );
    const nomi = rows.find((r) => /飲み放題/.test(r.quote ?? ""));
    assert.ok(nomi);
    assert.equal(nomi.kind, "SET_MENU");
    assert.equal(nomi.amountMinJpy, 1650);
    assert.equal(nomi.unit, "PER_PERSON");
    // 税込パターンとの二重登録をしない
    assert.equal(rows.filter((r) => r.amountMinJpy === 1650).length, 1);
  });

  it("skips kids lunch/course from SET_MENU estimates", () => {
    const rows = extractPriceCandidatesFromText(
      "お子様ランチ 800円。コース 4,500円。",
      "https://example.com/menu",
    );
    assert.ok(!rows.some((r) => r.kind === "SET_MENU" && r.amountMinJpy === 800));
    assert.ok(rows.some((r) => r.kind === "SET_MENU" && r.amountMinJpy === 4500));
  });

  it("does not treat Japanese reading comma as thousand separator", () => {
    const rows = extractPriceCandidatesFromText(
      "コーヒー 500、600円。大人 800、1,000円。",
      "https://example.com/menu",
    );
    assert.ok(!rows.some((r) => r.amountMinJpy === 500600));
    assert.ok(!rows.some((r) => r.amountMinJpy === 8001000));
  });

  it("skips addon surcharges like +300円", () => {
    const rows = extractPriceCandidatesFromText(
      "コース 4,500円。ドリンクセット +300円。飲み放題 +1,650円。",
      "https://example.com/menu",
    );
    assert.ok(rows.some((r) => r.kind === "SET_MENU" && r.amountMinJpy === 4500));
    assert.ok(!rows.some((r) => r.amountMinJpy === 300));
    assert.ok(!rows.some((r) => r.amountMinJpy === 650));
  });

  it("does not treat parking tax-included yen as dining menu", () => {
    const rows = extractPriceCandidatesFromText(
      "駐車場 1時間 税込 400円。グランドメニュー 税込 390円。",
      "https://example.com/menu",
    );
    assert.ok(!rows.some((r) => r.amountMinJpy === 400));
    assert.ok(rows.some((r) => r.amountMinJpy === 390 && /グランドメニュー/.test(r.quote ?? "")));
  });

  it("extracts same-origin fee/menu links from html", () => {
    const links = extractSameOriginFeeLinks(
      `<a href="/ryokin">料金</a><a href="/menu">menu</a><a href="https://other.example/fee">x</a><a href="#top">skip</a>`,
      "https://example.com/home",
    );
    assert.ok(links.some((u) => u.includes("/ryokin") || u.includes("/menu")));
    assert.ok(!links.some((u) => u.includes("other.example")));
  });

  it("estimates izakaya SET_MENU as two-person ESTIMATED without budget ceiling", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "set1",
          kind: "SET_MENU",
          unit: "PER_PERSON",
          usageKind: "DINING",
          amountMinJpy: 4500,
          amountMaxJpy: 4500,
          quote: "コース 4500円",
          confirmation: "PARTIAL",
          maxInclusive: false,
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.status, "ESTIMATED");
    assert.equal(accounting.amountMinJpy, 9000);
    assert.equal(accounting.maxInclusive, false);
    assert.equal(budgetCeilingJpy(accounting), null);
    assert.match(accounting.assumptionLabel ?? "", /コース/);
  });

  it("falls back to cheapest two MENU_ITEMs when drink+sweet missing", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "m1",
          kind: "MENU_ITEM",
          unit: "PER_ITEM",
          usageKind: "DINING",
          amountMinJpy: 480,
          amountMaxJpy: 480,
          quote: "焼き鳥 480円",
          confirmation: "PARTIAL",
          maxInclusive: false,
        }),
        fact({
          id: "m2",
          kind: "MENU_ITEM",
          unit: "PER_ITEM",
          usageKind: "DINING",
          amountMinJpy: 680,
          amountMaxJpy: 680,
          quote: "刺身 680円",
          confirmation: "PARTIAL",
          maxInclusive: false,
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.status, "ESTIMATED");
    assert.equal(accounting.amountMinJpy, (480 + 680) * 2);
    assert.equal(accounting.maxInclusive, false);
    assert.equal(budgetCeilingJpy(accounting), null);
    assert.match(accounting.assumptionLabel ?? "", /安いメニュー2品/);
  });

  it("estimates single uniform MENU_ITEM only when quote marks グランドメニュー", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "m1",
          kind: "MENU_ITEM",
          unit: "PER_ITEM",
          usageKind: "DINING",
          amountMinJpy: 390,
          amountMaxJpy: 390,
          quote: "税込 390円 グランドメニュー",
          confirmation: "PARTIAL",
          maxInclusive: false,
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.status, "ESTIMATED");
    assert.equal(accounting.amountMinJpy, 390 * 2 * 2);
    assert.equal(accounting.maxInclusive, false);
    assert.match(accounting.assumptionLabel ?? "", /同一メニュー2品/);
  });

  it("does not estimate bare single MENU_ITEM without uniform marker", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "m1",
          kind: "MENU_ITEM",
          unit: "PER_ITEM",
          usageKind: "DINING",
          amountMinJpy: 400,
          amountMaxJpy: 400,
          quote: "税込 400円",
          confirmation: "PARTIAL",
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.status, "UNKNOWN");
  });

  it("prefers course SET_MENU over nomihodai-looking quotes", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "n1",
          kind: "SET_MENU",
          unit: "PER_PERSON",
          usageKind: "DINING",
          amountMinJpy: 1650,
          amountMaxJpy: 1650,
          quote: "飲み放題 1650円",
          confirmation: "PARTIAL",
        }),
        fact({
          id: "c1",
          kind: "SET_MENU",
          unit: "PER_PERSON",
          usageKind: "DINING",
          amountMinJpy: 4500,
          amountMaxJpy: 4500,
          quote: "コース 4500円",
          confirmation: "PARTIAL",
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.amountMinJpy, 9000);
    assert.match(accounting.assumptionLabel ?? "", /コース/);
  });

  it("estimates nomihodai alone as two-person drinking ESTIMATED", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "n1",
          kind: "SET_MENU",
          unit: "PER_PERSON",
          usageKind: "DINING",
          amountMinJpy: 2980,
          amountMaxJpy: 2980,
          quote: "飲み放題 2980円",
          confirmation: "PARTIAL",
          maxInclusive: false,
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.status, "ESTIMATED");
    assert.equal(accounting.amountMinJpy, 5960);
    assert.equal(accounting.maxInclusive, false);
    assert.equal(budgetCeilingJpy(accounting), null);
    assert.match(accounting.assumptionLabel ?? "", /飲み放題/);
  });

  it("prefers nomihodai over cheap two MENU_ITEMs for drinking spots", () => {
    const accounting = computeCostAccounting({
      facts: [
        fact({
          id: "n1",
          kind: "SET_MENU",
          unit: "PER_PERSON",
          usageKind: "DINING",
          amountMinJpy: 2980,
          amountMaxJpy: 2980,
          quote: "飲み放題 2980円",
          confirmation: "PARTIAL",
        }),
        fact({
          id: "m1",
          kind: "MENU_ITEM",
          unit: "PER_ITEM",
          usageKind: "DINING",
          amountMinJpy: 390,
          amountMaxJpy: 390,
          quote: "焼き鳥 390円",
          confirmation: "PARTIAL",
        }),
        fact({
          id: "m2",
          kind: "MENU_ITEM",
          unit: "PER_ITEM",
          usageKind: "DINING",
          amountMinJpy: 480,
          amountMaxJpy: 480,
          quote: "刺身 480円",
          confirmation: "PARTIAL",
        }),
      ],
      dateTokyo: "2026-09-21",
      weekday: 1,
      partySize: 2,
      preferUsage: "DINING",
      isDining: true,
    });
    assert.equal(accounting.amountMinJpy, 5960);
    assert.match(accounting.assumptionLabel ?? "", /飲み放題/);
  });

  it("treats official URL + quote-in-body candidates as VERIFIED-eligible via confirmation field", () => {
    const rows = extractPriceCandidatesFromText(
      "一般入場料は1200円です。",
      "https://official.example/fee",
    );
    const admission = rows.find((r) => r.amountMinJpy === 1200);
    assert.ok(admission);
    assert.equal(admission.confirmation, "PARTIAL");
    const verified = fact({
      ...admission,
      id: "v1",
      kind: admission.kind,
      unit: admission.unit,
      confirmation: "VERIFIED",
      branchMatch: "OFFICIAL_URL",
      quote: admission.quote,
    });
    assert.equal(verified.confirmation, "VERIFIED");
    assert.equal(verified.branchMatch, "OFFICIAL_URL");
  });

  it("trusts official path by segment prefix, not substring leaf", () => {
    assert.equal(
      officialPageTrusted(
        "https://www.tokyo-park.or.jp/park/kiyosumi/index.html",
        "https://www.tokyo-park.or.jp/park/kiyosumi/index.html",
      ),
      true,
    );
    assert.equal(
      officialPageTrusted(
        "https://www.tokyo-park.or.jp/park/kiyosumi/index.html",
        "https://www.tokyo-park.or.jp/park/kiyosumi-xxx/index.html",
      ),
      false,
    );
  });

  it("blocks price reapply on settled sessions", () => {
    assert.equal(sessionAllowsPriceReapply("PLANNING"), true);
    assert.equal(sessionAllowsPriceReapply("DRAFT"), true);
    assert.equal(sessionAllowsPriceReapply(null), true);
    assert.equal(sessionAllowsPriceReapply("CONFIRMED"), false);
    assert.equal(sessionAllowsPriceReapply("DONE"), false);
    assert.equal(sessionAllowsPriceReapply("REFLECTED"), false);
  });
});
