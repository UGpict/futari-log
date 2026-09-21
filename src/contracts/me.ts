import { z } from "zod";

export const runtimeModeSchema = z.enum(["MOCK", "LIVE"]);
export const dataBackendSchema = z.enum(["file", "firestore"]);
export const authBackendSchema = z.enum(["mock", "firebase"]);

export const blockerSchema = z.object({
  code: z.string(),
  item: z.string(),
  status: z.literal("BLOCKED").optional(),
});
export type Blocker = z.infer<typeof blockerSchema>;

export const meResponseSchema = z.object({
  uid: z.string(),
  coupleId: z.string().nullable(),
  runtime: z.string(),
  authBackend: z.string().optional(),
  dataBackend: z.string().optional(),
  emulator: z.boolean().optional(),
  demoControls: z.boolean().optional(),
  /** Tournament calendar sample stickers (display-only; not Firestore). */
  demoCalendarStickers: z.boolean().optional(),
  demoCalendarAnchorDate: z.string().optional(),
  demoAreaName: z.string(),
  demoDate: z.string(),
  demoLat: z.number(),
  demoLng: z.number(),
  blockers: z.array(blockerSchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const anonymousAuthResponseSchema = z.object({
  uid: z.string(),
  runtime: z.string(),
  authBackend: z.string().optional(),
  dataBackend: z.string().optional(),
  emulator: z.boolean().optional(),
});
export type AnonymousAuthResponse = z.infer<typeof anonymousAuthResponseSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  runtime: z.string(),
  authBackend: z.string(),
  dataBackend: z.string(),
  emulator: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
