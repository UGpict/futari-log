import { z } from "zod";

/** すべての API エラー応答。画面は message ではなく error を読む。 */
export const apiErrorSchema = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
