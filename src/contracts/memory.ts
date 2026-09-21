import { z } from "zod";

export const memoryPlanDirectiveDtoSchema = z.object({
  kind: z.enum([
    "PREFER_SEATED_REST",
    "SHORTEN_CATEGORY_STAY",
    "REVISIT_SPOT",
    "PREFER_NEW_SPOTS",
    "WALK_HARD_CAP",
  ]),
  categories: z.array(z.string()).optional(),
  spotId: z.string().nullable().optional(),
  maxStayMinutes: z.number().nullable().optional(),
  walkHardCapMinutes: z.number().nullable().optional(),
});

export const memoryDtoSchema = z.object({
  id: z.string(),
  content: z.string(),
  active: z.boolean(),
  strength: z.string(),
  sourceType: z.string(),
  subject: z.string().optional(),
  type: z.string().optional(),
  scope: z.string().optional(),
  evidenceQuote: z.string(),
  confirmation: z.string(),
  version: z.number(),
  planDirectives: z.array(memoryPlanDirectiveDtoSchema).optional(),
  reflectionId: z.string().optional(),
  reflectionVersion: z.number().optional(),
  targetSessionId: z.string().nullable().optional(),
  approvedAt: z.string().optional(),
});
export type MemoryDto = z.infer<typeof memoryDtoSchema>;

export const memoryCandidateDtoSchema = z.object({
  id: z.string(),
  content: z.string(),
  evidenceQuote: z.string(),
  subject: z.string().optional(),
  sourceType: z.string().optional(),
  strength: z.string().optional(),
  scope: z.string().optional(),
  planDirectives: z.array(memoryPlanDirectiveDtoSchema).optional(),
  reflectionId: z.string().optional(),
  reflectionVersion: z.number().optional(),
  approvalId: z.string().nullable().optional(),
});
export type MemoryCandidateDto = z.infer<typeof memoryCandidateDtoSchema>;

export const memoryListResponseSchema = z.object({
  ok: z.literal(true).optional(),
  memories: z.array(memoryDtoSchema.passthrough()),
  candidates: z.array(memoryCandidateDtoSchema.passthrough()),
});
export type MemoryListResponse = z.infer<typeof memoryListResponseSchema>;

export const reviseMemoryRequestSchema = z.object({
  content: z.string().min(1),
  expectedVersion: z.number().int().positive(),
});
export type ReviseMemoryRequest = z.infer<typeof reviseMemoryRequestSchema>;

export const createMemoryNoteRequestSchema = z.object({
  content: z.string().min(1).max(300),
  scope: z.enum(["NEXT_DATE", "ONGOING"]).default("ONGOING"),
  planDirectives: z.array(memoryPlanDirectiveDtoSchema).default([]),
});
export type CreateMemoryNoteRequest = z.infer<typeof createMemoryNoteRequestSchema>;
