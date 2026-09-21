import { z } from "zod";

/** 公式ページ上の単価事実。二人会計の確定とは別。 */
export const priceKindSchema = z.enum([
  "ADMISSION",
  "SPECIAL_EXHIBITION",
  "MENU_ITEM",
  "SET_MENU",
  "PLACES_BAND",
  "OTHER",
]);
export type PriceKind = z.infer<typeof priceKindSchema>;

export const priceUnitSchema = z.enum([
  "PER_PERSON",
  "PER_ITEM",
  "PER_SET",
  "PER_GROUP",
  "UNKNOWN",
]);
export type PriceUnit = z.infer<typeof priceUnitSchema>;

export const priceAudienceSchema = z.enum([
  "GENERAL",
  "CHILD",
  "STUDENT",
  "SENIOR",
  "OTHER",
  "UNKNOWN",
]);
export type PriceAudience = z.infer<typeof priceAudienceSchema>;

export const usageKindSchema = z.enum([
  "PERMANENT",
  "SPECIAL_EXHIBITION",
  "GARDEN",
  "DINING",
  "UNKNOWN",
]);
export type UsageKind = z.infer<typeof usageKindSchema>;

export const priceFactConfirmationSchema = z.enum(["VERIFIED", "PARTIAL", "UNKNOWN"]);
export type PriceFactConfirmation = z.infer<typeof priceFactConfirmationSchema>;

/** 二人の会計側。公式単価 VERIFIED でも注文仮定があれば ESTIMATED。 */
export const costAccountingStatusSchema = z.enum(["CALCULATED", "ESTIMATED", "UNKNOWN"]);
export type CostAccountingStatus = z.infer<typeof costAccountingStatusSchema>;

export const taxTreatmentSchema = z.enum(["INCLUDED", "EXCLUDED", "UNKNOWN"]);
export type TaxTreatment = z.infer<typeof taxTreatmentSchema>;

export const officialPriceFactSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  venueName: z.string(),
  kind: priceKindSchema,
  amountMinJpy: z.number().nullable(),
  amountMaxJpy: z.number().nullable(),
  /** end 境界を含むか。上限不明なら false かつ amountMaxJpy null。 */
  maxInclusive: z.boolean(),
  currency: z.literal("JPY"),
  unit: priceUnitSchema,
  audience: priceAudienceSchema,
  usageKind: usageKindSchema,
  /** 適用曜日。空なら制限なし（確認済みの場合）。未確認なら null。 */
  weekdays: z.array(z.number().int().min(0).max(6)).nullable(),
  timeStart: z.string().nullable(),
  timeEnd: z.string().nullable(),
  dateStart: z.string().nullable(),
  dateEnd: z.string().nullable(),
  exclusionNote: z.string().nullable(),
  tax: taxTreatmentSchema,
  extraFeesUnknown: z.boolean(),
  confirmation: priceFactConfirmationSchema,
  sourceUrl: z.string().nullable(),
  quote: z.string().nullable(),
  fetchedAt: z.string(),
  revalidateBy: z.string().nullable(),
  evidenceIds: z.array(z.string()),
  branchMatch: z.enum(["PLACE_ID", "ADDRESS", "OFFICIAL_URL", "NAME_ONLY", "UNCONFIRMED"]),
});
export type OfficialPriceFact = z.infer<typeof officialPriceFactSchema>;

export const placesPriceBandSchema = z.object({
  minJpy: z.number().nullable(),
  maxJpy: z.number().nullable(),
  maxInclusive: z.boolean(),
  /** 常に true。単位不明の Places 帯は二人料金にしない。 */
  unitUnknown: z.literal(true),
  source: z.literal("places.priceRange"),
});
export type PlacesPriceBand = z.infer<typeof placesPriceBandSchema>;

export const costBreakdownLineSchema = z.object({
  label: z.string(),
  amountJpy: z.number().nullable(),
  factId: z.string().nullable(),
});
export type CostBreakdownLine = z.infer<typeof costBreakdownLineSchema>;

export const costAccountingSchema = z.object({
  status: costAccountingStatusSchema,
  /** 例: 一般2名・常設展 / 二人の目安（各1ドリンク+スイーツ） */
  assumptionLabel: z.string().nullable(),
  amountMinJpy: z.number().nullable(),
  amountMaxJpy: z.number().nullable(),
  maxInclusive: z.boolean(),
  breakdown: z.array(costBreakdownLineSchema),
  sourceUrl: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  note: z.string().nullable(),
  /** 判明分だけの小計（不明項目ありでも設定可） */
  knownSubtotalJpy: z.number().nullable(),
  unknownLabels: z.array(z.string()),
});
export type CostAccounting = z.infer<typeof costAccountingSchema>;

export const priceEvidenceSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  sourceUrl: z.string(),
  quote: z.string().nullable(),
  fetchedAt: z.string(),
  bytes: z.number().nullable(),
  contentType: z.string().nullable(),
  note: z.string().nullable(),
});
export type PriceEvidence = z.infer<typeof priceEvidenceSchema>;

export const priceEnrichRunStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "SKIPPED_DUPLICATE",
  "STOPPED_LIMIT",
]);
export type PriceEnrichRunStatus = z.infer<typeof priceEnrichRunStatusSchema>;

export const priceEnrichRunSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  venueName: z.string(),
  status: priceEnrichRunStatusSchema,
  reason: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  model: z.string().nullable(),
  searchCount: z.number(),
  pagesFetched: z.number(),
  factsSaved: z.number(),
  costUsd: z.number().nullable(),
  costJpy: z.number().nullable(),
  stopReason: z.string().nullable(),
  error: z.string().nullable(),
  citationUrls: z.array(z.string()),
});
export type PriceEnrichRun = z.infer<typeof priceEnrichRunSchema>;

export const priceEnrichRequestSchema = z.object({
  placeId: z.string().min(1).max(200),
  venueName: z.string().min(1).max(200),
  address: z.string().max(400).nullable().optional(),
  websiteUri: z.string().url().nullable().optional(),
  reason: z.string().max(200).optional(),
});
export type PriceEnrichRequest = z.infer<typeof priceEnrichRequestSchema>;

export const priceEnrichResponseSchema = z.object({
  ok: z.boolean(),
  runId: z.string(),
  status: priceEnrichRunStatusSchema,
  factsSaved: z.number(),
  error: z.string().nullable(),
});
export type PriceEnrichResponse = z.infer<typeof priceEnrichResponseSchema>;
