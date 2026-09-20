import { z } from "zod";

export const confirmationStatusSchema = z.enum(["VERIFIED", "PARTIAL", "UNKNOWN"]);
export type ConfirmationStatus = z.infer<typeof confirmationStatusSchema>;

export const catalogFieldEvidenceSchema = z.object({
  value: z.string().nullable(),
  confirmation: confirmationStatusSchema,
  sourceUrl: z.string().nullable(),
  quote: z.string().nullable(),
  fetchedAt: z.string().nullable(),
});
export type CatalogFieldEvidence = z.infer<typeof catalogFieldEvidenceSchema>;

export const catalogImageSchema = z.object({
  kind: z.enum(["EVENT", "VENUE"]),
  sourceUrl: z.string().nullable(),
  attribution: z.string().nullable(),
  confirmation: confirmationStatusSchema,
});
export type CatalogImage = z.infer<typeof catalogImageSchema>;

export const catalogEventListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  genre: z.string(),
  venueId: z.string().nullable(),
  venueName: z.string().nullable(),
  dateStart: z.string().nullable(),
  dateEnd: z.string().nullable(),
  confirmation: confirmationStatusSchema,
  sourceUrl: z.string().nullable(),
  fetchedAt: z.string(),
  planEligible: z.boolean(),
});
export type CatalogEventListItem = z.infer<typeof catalogEventListItemSchema>;

export const catalogEventDetailSchema = catalogEventListItemSchema.extend({
  timeStart: z.string().nullable(),
  timeEnd: z.string().nullable(),
  fridayClose: z.string().nullable(),
  closedDaysText: z.string().nullable(),
  feeText: z.string().nullable(),
  officialUrl: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  fields: z.object({
    title: catalogFieldEvidenceSchema,
    periodStart: catalogFieldEvidenceSchema,
    periodEnd: catalogFieldEvidenceSchema,
    hours: catalogFieldEvidenceSchema,
    fridayClose: catalogFieldEvidenceSchema,
    closedDays: catalogFieldEvidenceSchema,
    venue: catalogFieldEvidenceSchema,
    fee: catalogFieldEvidenceSchema,
  }),
  eventImage: catalogImageSchema.nullable(),
  sourceTitle: z.string().nullable(),
  photos: z.object({
    event: catalogImageSchema.nullable(),
    venue: catalogImageSchema.nullable(),
    displayVerified: z.literal(false),
    note: z.string(),
  }),
});
export type CatalogEventDetail = z.infer<typeof catalogEventDetailSchema>;

export const catalogVenueDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  placeId: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  types: z.array(z.string()),
  websiteUri: z.string().nullable(),
  googleMapsUri: z.string().nullable(),
  hoursFetchedAt: z.string().nullable(),
  hasOpeningHours: z.boolean(),
  venuePhoto: catalogImageSchema.nullable(),
  fetchedAt: z.string(),
  confirmation: confirmationStatusSchema,
});
export type CatalogVenueDetail = z.infer<typeof catalogVenueDetailSchema>;

export const catalogEventListResponseSchema = z.object({
  events: z.array(catalogEventListItemSchema),
  fetchedAt: z.string().nullable(),
});
export type CatalogEventListResponse = z.infer<typeof catalogEventListResponseSchema>;

export const catalogIngestRequestSchema = z.object({
  dateTokyo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  genre: z.string().min(1).max(40).optional(),
  areaName: z.string().min(1).max(80).optional(),
});
export type CatalogIngestRequest = z.infer<typeof catalogIngestRequestSchema>;

export const catalogIngestResponseSchema = z.object({
  ok: z.boolean(),
  runId: z.string(),
  status: z.string(),
  saved: z.number(),
  error: z.string().nullable(),
});
export type CatalogIngestResponse = z.infer<typeof catalogIngestResponseSchema>;

export const selectEventsRequestSchema = z.object({
  eventIds: z.array(z.string()).max(4),
});
export type SelectEventsRequest = z.infer<typeof selectEventsRequestSchema>;

export const selectEventsResponseSchema = z.object({
  sessionId: z.string(),
  selectedEventIds: z.array(z.string()),
});
export type SelectEventsResponse = z.infer<typeof selectEventsResponseSchema>;
