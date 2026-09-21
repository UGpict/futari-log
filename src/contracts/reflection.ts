import { z } from "zod";

export const reflectionVisitDtoSchema = z.object({
  planItemId: z.string(),
  spotId: z.string(),
  visited: z.boolean(),
  rating: z.enum(["good", "ok", "bad"]).nullable().optional(),
  note: z.string().nullable().optional(),
});

export const saveReflectionRequestSchema = z.object({
  title: z.string().max(60).default(""),
  note: z.string().max(500),
  mood: z.enum(["happy", "relaxed", "tired", "sad"]).nullable().optional(),
  planVersion: z.number().int().positive().nullable().optional(),
  visits: z.array(reflectionVisitDtoSchema).default([]),
  /** 既存振り返りの更新。未指定なら新規作成。 */
  reflectionId: z.string().optional(),
  expectedContentVersion: z.number().int().positive().optional(),
});
export type SaveReflectionRequest = z.infer<typeof saveReflectionRequestSchema>;

export const reflectionDtoSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  planVersion: z.number().nullable(),
  dateTokyo: z.string().nullable(),
  title: z.string(),
  note: z.string(),
  mood: z.enum(["happy", "relaxed", "tired", "sad"]).nullable(),
  visits: z.array(reflectionVisitDtoSchema),
  contentVersion: z.number(),
  analysisStatus: z.string(),
  analysisRunId: z.string().nullable(),
  analysisError: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  waitingQuestion: z
    .object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()),
    })
    .nullable()
    .optional(),
});
export type ReflectionDto = z.infer<typeof reflectionDtoSchema>;

export const saveReflectionResponseSchema = z.object({
  ok: z.literal(true),
  reflection: reflectionDtoSchema,
  analysisEnqueued: z.boolean(),
});
export type SaveReflectionResponse = z.infer<typeof saveReflectionResponseSchema>;

export const reflectionListResponseSchema = z.object({
  reflections: z.array(reflectionDtoSchema),
});
export type ReflectionListResponse = z.infer<typeof reflectionListResponseSchema>;

export const answerReflectionRequestSchema = z.object({
  reflectionId: z.string(),
  answer: z.string().min(1),
});
export type AnswerReflectionRequest = z.infer<typeof answerReflectionRequestSchema>;
