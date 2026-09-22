import { z } from "zod";

/** 待機質問の選択肢。id 付きなら回答は answerId で判定する（文言変更に耐える）。 */
export const waitingOptionSchema = z.union([
  z.string(),
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
  }),
]);
export type WaitingOption = z.infer<typeof waitingOptionSchema>;

export function waitingOptionLabel(option: WaitingOption): string {
  return typeof option === "string" ? option : option.label;
}

export function waitingOptionId(option: WaitingOption): string | null {
  return typeof option === "string" ? null : option.id;
}

export function choice(id: string, label: string): WaitingOption {
  return { id, label };
}

/** 条件変更系・中断系で共通の選択肢 ID。 */
export const ANSWER = {
  change_conditions: "change_conditions",
  abort: "abort",
  continue_spa: "continue_spa",
  continue_supported: "continue_supported",
  continue_tokyo: "continue_tokyo",
  continue_range: "continue_range",
  continue_event_fallback: "continue_event_fallback",
  reduce_wishes: "reduce_wishes",
  continue_walk: "continue_walk",
  use_transit: "use_transit",
  change_endpoints: "change_endpoints",
  retry_routes: "retry_routes",
  shrink_search: "shrink_search",
} as const;

export type AnswerId = (typeof ANSWER)[keyof typeof ANSWER];

/** ラベルから ID への互換マップ（旧 string options / 移行中）。 */
const LEGACY_LABEL_TO_ID: Record<string, string> = {
  "条件を変える": ANSWER.change_conditions,
  "場所を選び直す": ANSWER.change_conditions,
  "集合・解散を変える": ANSWER.change_conditions,
  "解散場所を変える": ANSWER.change_endpoints,
  "中断する": ANSWER.abort,
  "スパとして探す": ANSWER.continue_spa,
  "対応できる範囲で続ける": ANSWER.continue_supported,
  "都内の場所です": ANSWER.continue_tokyo,
  "この範囲で続ける": ANSWER.continue_range,
  "施設の候補で続ける": ANSWER.continue_event_fallback,
  "希望を減らす": ANSWER.reduce_wishes,
  "このまま徒歩で続ける": ANSWER.continue_walk,
  "公共交通を使う": ANSWER.use_transit,
  "経路を再取得する": ANSWER.retry_routes,
  "近場の候補で組み直す": ANSWER.shrink_search,
};

export function resolveWaitingAnswerId(
  options: WaitingOption[],
  answer: string | undefined,
  answerId: string | undefined,
): string | null {
  if (answerId) return answerId;
  if (!answer) return null;
  for (const option of options) {
    if (typeof option !== "string") {
      if (option.id === answer || option.label === answer) return option.id;
    }
  }
  return LEGACY_LABEL_TO_ID[answer] ?? null;
}

export function resolveWaitingAnswerLabel(
  options: WaitingOption[],
  answer: string | undefined,
  answerId: string | undefined,
): string {
  if (answer) return answer;
  if (answerId) {
    for (const option of options) {
      if (typeof option !== "string" && option.id === answerId) return option.label;
    }
    return answerId;
  }
  return "";
}
