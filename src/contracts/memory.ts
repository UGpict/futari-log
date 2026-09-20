import { z } from "zod";

export const memoryDtoSchema = z.object({
  id: z.string(),
  content: z.string(),
  active: z.boolean(),
  strength: z.string(),
  sourceType: z.string(),
  evidenceQuote: z.string(),
  confirmation: z.string(),
  version: z.number(),
});
export type MemoryDto = z.infer<typeof memoryDtoSchema>;

export const memoryCandidateDtoSchema = z.object({
  id: z.string(),
  content: z.string(),
  evidenceQuote: z.string(),
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
});
export type ReviseMemoryRequest = z.infer<typeof reviseMemoryRequestSchema>;
