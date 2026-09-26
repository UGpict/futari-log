import { z } from "zod";

/** すべての API エラー応答。画面は message ではなく error を読む。 */
export const apiErrorSchema = z.object({
  error: z.string(),
  /** Ops / auth machine-readable code when present (e.g. RATE_LIMITED). */
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
