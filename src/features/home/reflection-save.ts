/** 振り返りの保存先判定。画面はこれを見て save / saveToServer を選ぶ。 */

export type ReflectionSaveDecision =
  | { dest: "server"; sessionId: string }
  | { dest: "local"; reason: "fixture" | "none" | "multiple" };

export function decideReflectionSave(input: {
  isFixture: boolean;
  /** DONE / REFLECTED / CONFIRMED / IN_PROGRESS の同日セッション ID */
  reflectableSessionIds: string[];
}): ReflectionSaveDecision {
  if (input.isFixture) return { dest: "local", reason: "fixture" };
  if (input.reflectableSessionIds.length === 1) {
    return { dest: "server", sessionId: input.reflectableSessionIds[0]! };
  }
  if (input.reflectableSessionIds.length > 1) return { dest: "local", reason: "multiple" };
  return { dest: "local", reason: "none" };
}

export function reflectionSaveNotice(
  decision: ReflectionSaveDecision,
  opts?: { offline?: boolean },
): string {
  if (opts?.offline) {
    return "オフラインのため端末にのみ保存しました。再接続後にサーバーへ送れます。";
  }
  if (decision.dest === "server") {
    return "振り返りをサーバーに保存しました。分析は裏で続きます。";
  }
  if (decision.reason === "multiple") {
    return "同日に複数の予定があるため、端末にのみ保存しました（セッション紐付けは未選択）。";
  }
  if (decision.reason === "fixture") {
    return "サンプル表示のため、振り返りをこの端末にのみ保存しました。";
  }
  return "紐づく予定がないため、振り返りをこの端末にのみ保存しました。";
}
