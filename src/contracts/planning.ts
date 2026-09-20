import { z } from "zod";

export const preferenceSchema = z.object({
  id: z.string(),
  subject: z.enum(["SELF", "PARTNER", "BOTH"]),
  content: z.string().min(1).max(2000),
  priority: z.enum(["MUST", "PREFER"]),
  source: z.enum(["SELF_REPORT", "PARTNER_STATEMENT_REPORTED", "OBSERVATION"]),
});
export type Preference = z.infer<typeof preferenceSchema>;

export const travelModeSchema = z.enum(["WALK", "TRANSIT", "DRIVE"]);
export type TravelMode = z.infer<typeof travelModeSchema>;

export const fixedAppointmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  spotId: z.string().nullable(),
  spotNameHint: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  kind: z.literal("TIME_FIXED"),
});
export type FixedAppointment = z.infer<typeof fixedAppointmentSchema>;

export const budgetSchema = z.object({
  mealsJpy: z.number().nullable(),
  facilitiesJpy: z.number().nullable(),
  transitJpy: z.number().nullable(),
});
export type Budget = z.infer<typeof budgetSchema>;

export const autoApplyPolicySchema = z.object({
  enabled: z.boolean(),
  acknowledgedScope: z.string().nullable(),
  validUntil: z.string().nullable(),
});
export type AutoApplyPolicy = z.infer<typeof autoApplyPolicySchema>;

export const meetPointSchema = z.object({
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  spotId: z.string().nullable(),
  address: z.string().nullable().optional(),
});
export type MeetPoint = z.infer<typeof meetPointSchema>;

export const planningInputSchema = z.object({
  dateTokyo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  meet: meetPointSchema,
  end: meetPointSchema,
  budget: budgetSchema,
  preferences: z.array(preferenceSchema).min(1),
  fixedAppointments: z.array(fixedAppointmentSchema),
  autoApply: autoApplyPolicySchema,
  travelMode: travelModeSchema.default("WALK"),
  areaName: z.string(),
  areaLat: z.number(),
  areaLng: z.number(),
  radiusMeters: z.number().default(2500),
  selectedEventIds: z.array(z.string()).optional(),
  eventFallbackAcknowledged: z.boolean().optional(),
  unsupportedWishAcknowledged: z.boolean().optional(),
  walkLongAcknowledged: z.boolean().optional(),
  tokyoAreaAcknowledged: z.boolean().optional(),
  searchExpandAcknowledged: z.boolean().optional(),
});
export type PlanningInput = z.infer<typeof planningInputSchema>;

export const createCoupleRequestSchema = z.object({
  isDemo: z.boolean().optional(),
});
export type CreateCoupleRequest = z.infer<typeof createCoupleRequestSchema>;

export const createCoupleResponseSchema = z.object({
  id: z.string(),
});
export type CreateCoupleResponse = z.infer<typeof createCoupleResponseSchema>;

export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
  input: planningInputSchema,
});
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
