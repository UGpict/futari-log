/** 3691949 と同じ: 押すたびに改行で追記（トグルしない）。 */
export function appendFeedbackQuick(current: string, text: string): string {
  return current ? `${current}\n${text}` : text;
}

export const FEEDBACK_QUICK_OPTIONS = [
  "別の場所がいい",
  "もう少し予算を抑えたい",
  "ゆっくり過ごしたい",
  "移動を少なくしたい",
] as const;
