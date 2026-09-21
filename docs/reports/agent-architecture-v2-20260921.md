# 検証メモ: agent-architecture-v2（2026-09-21）

## 単体（MOCK / ローカル）

| 項目 | 結果 |
| --- | --- |
| `tsc --noEmit` | OK |
| `tests/memory-directives.test.ts` | OK（directive 有無で滞在差、WALK_HARD_CAP、仮説拒否、NEXT_DATE 束縛） |
| `tests/privacy.test.ts` | OK |
| `tests/plan.test.ts` | OK |

## 実LLM / 実API / 画面

| 項目 | 状態 |
| --- | --- |
| LIVE 振り返り保存→分析 | 未実施（PR 後、手動で session を DONE にして確認） |
| OrcaRouter 経由の reflect | コード上 `callLLM(task: "reflect")`。LIVE キー不足時はモックへ落とさない既存方針を維持（キー無しは mock 経路だが runtime=LIVE では失敗扱い） |
| ホーム振り返り UI | 同日1セッション時に API 保存。複数・0件は localStorage のみ。旧 local は削除しない |
| 本番 Scheduler | 変更・有効化なし |

## 未実施 / TODO

- 同日複数セッションの明示選択 UI
- 承認待ち専用画面（候補は memory API に `approvalId` 付与済み）
- LIVE 通し検証の runId / 費用記録
- 本番デプロイ・マージ・定時ジョブ有効化（本 PR では行わない）
