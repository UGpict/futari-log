import type { PublicPlanDTO } from "@/domain/schemas";

const BLOCK = /(無視して|ignore (all )?(previous|above)|system prompt|ツールを実行|api[_-]?key)/i;

export function draftShareMessage(dto: PublicPlanDTO): { text: string | null; blocked: boolean } {
  const lines = [
    `${dto.dateTokyo}、${dto.meetName}集合でどうかな。`,
    ...dto.items.map((item) => {
      const url = item.officialUrl ? ` ${item.officialUrl}` : "";
      return `・${item.name}（${item.startAt}–${item.endAt}）${url}`;
    }),
    `終わりは${dto.endName}の予定。`,
  ];
  const text = lines.join("\n");
  if (BLOCK.test(text)) {
    return { text: null, blocked: true };
  }
  return { text, blocked: false };
}
