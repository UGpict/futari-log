"use client";

import { FX } from "@/config/public";

export function CostBadge(props: {
  llmJpy: number | null;
  apiJpy: number | null;
  hard: number;
  mundane: number;
  unaccounted: number;
  replay?: boolean;
}) {
  const total =
    props.llmJpy != null || props.apiJpy != null
      ? (props.llmJpy ?? 0) + (props.apiJpy ?? 0)
      : null;
  const label = props.replay ? "収録時のコスト" : "今回の概算";
  const amount =
    total == null
      ? `集計可能分・未計上${props.unaccounted}回`
      : `¥${total}・高性能${props.hard}回／安価${props.mundane}回`;
  return (
    <div className="fixed right-4 bottom-4 z-40 rounded-full border border-line bg-card px-4 py-2 text-sm shadow-md">
      <div className="text-[11px] text-ink-soft">{label}</div>
      <div className="font-medium">{amount}</div>
      <div className="text-[10px] text-ink-soft">
        換算 {FX.usdJpy}円/USD（{FX.asOf}）
      </div>
    </div>
  );
}
