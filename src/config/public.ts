/** クライアントに出してよい公開設定。秘密・Admin・LLM キーは置かない。 */

export const TIME_ZONE = "Asia/Tokyo";

export const FX = {
  usdJpy: 148.5,
  asOf: "2026-09-01",
  note: "アプリ設定の固定換算。日次相場ではない",
} as const;
