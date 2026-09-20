export function SourceChip({ kind }: { kind: string }) {
  const label: Record<string, string> = {
    API: "取得",
    CACHE: "キャッシュ",
    ESTIMATED: "推定",
    INJECTED: "注入",
    USER: "入力",
    UNKNOWN: "不明",
  };
  return (
    <span className="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] text-ink-soft">
      {label[kind] ?? kind}
    </span>
  );
}

export function ModeBanner(props: {
  runtime: string;
  mode?: string;
  overlays?: string[];
  replay?: boolean;
}) {
  if (props.replay) {
    return (
      <div className="rounded-xl bg-ink px-4 py-2 text-center text-sm text-white">
        録画済みの再生：外部APIも新規課金もしません
      </div>
    );
  }
  const live = props.runtime === "LIVE";
  return (
    <div
      className={`rounded-xl px-4 py-2 text-sm ${live ? "bg-moss-soft text-moss" : "bg-amber-soft text-amber"}`}
    >
      {live ? "LIVE" : "モック実行"}
      {props.mode === "LIVE_SCENARIO" || (props.overlays && props.overlays.length > 0)
        ? ` ＋シナリオ注入（${(props.overlays ?? []).join("、") || "あり"}）`
        : null}
      {!live ? " — 実在スポットのカタログを使います。Google / OrcaRouter のライブ応答ではありません。" : null}
    </div>
  );
}
