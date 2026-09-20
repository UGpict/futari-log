import { z } from "zod";
import { costSchema, planDtoSchema, progressEventSchema } from "./session";

export const replayExportResponseSchema = z.object({
  replayId: z.string(),
});
export type ReplayExportResponse = z.infer<typeof replayExportResponseSchema>;

export const replayDtoSchema = z.object({
  id: z.string(),
  coupleId: z.string().optional(),
  sessionId: z.string().optional(),
  runId: z.string().optional(),
  createdAt: z.string().optional(),
  notes: z.string(),
  events: z.array(progressEventSchema),
  plan: planDtoSchema.nullable(),
  spots: z.array(z.object({ id: z.string(), name: z.string() }).passthrough()),
  costSnapshot: costSchema,
});
export type ReplayDto = z.infer<typeof replayDtoSchema>;

export const replayResponseSchema = z.object({
  ok: z.literal(true).optional(),
  replay: replayDtoSchema.passthrough(),
});
export type ReplayResponse = z.infer<typeof replayResponseSchema>;
