import { z } from "zod";

export const emailPasswordRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});
export type EmailPasswordRequest = z.infer<typeof emailPasswordRequestSchema>;

export const emailOnlyRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});
export type EmailOnlyRequest = z.infer<typeof emailOnlyRequestSchema>;

export const authSessionResponseSchema = z.object({
  uid: z.string(),
  email: z.string().nullable().optional(),
  emailVerified: z.boolean().optional(),
  runtime: z.string(),
  authBackend: z.string().optional(),
  dataBackend: z.string().optional(),
  emulator: z.boolean().optional(),
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const authVerifyStatusSchema = z.object({
  email: z.string().nullable(),
  emailVerified: z.boolean(),
});
export type AuthVerifyStatus = z.infer<typeof authVerifyStatusSchema>;
