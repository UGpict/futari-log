# LLM ルーティング（OrcaRouter）

最終更新: 2026-09-22

アプリの LLM 呼び出しは OrcaRouter 経由のみ。タスクごとに `mundane` / `hard` のプールを決め、環境変数の Named Router に送る。

## 環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| `ORCAROUTER_MUNDANE_MODEL` | `orcarouter/futari-mundane` | 頻度の高い・軽量な構造化 |
| `ORCAROUTER_HARD_MODEL` | `orcarouter/futari-hard` | 品質が効く・低頻度の判断 |

実装: `src/config/env.ts` / `src/server/llm/index.ts` の `TASK_POOL` と `modelFor(pool)`。

## タスクとルーターの対応

| タスク (`LlmTask`) | プール | Named Router | 備考 |
|---|---|---|---|
| `structure` | mundane | `orcarouter/futari-mundane` | カタログ構造化（`callOrcaJson`）など |
| `candidates` | mundane | `orcarouter/futari-mundane` | 候補整理 |
| `share` | mundane | `orcarouter/futari-mundane` | 共有文面など |
| `reflect` | hard | `orcarouter/futari-hard` | 振り返り分析。デート1回につきおおむね1回の非同期処理。抽出結果は承認後に次回プランへ効くため品質優先 |
| `final_plan` | hard | `orcarouter/futari-hard` | （予約）最終プラン系 |
| `replan` | hard | `orcarouter/futari-hard` | （予約）再計画系 |
| `conflict` | hard | `orcarouter/futari-hard` | （予約）矛盾解消系 |

通常の決定論プラン生成では LLM を呼ばない（`deterministic/planner`）。上記は LLM を使う経路のみ。

## 記録

Run の `MODEL_SELECTED` イベントに次を残す。

- `requestedModel` … Named Router 名（例: `orcarouter/futari-hard`）
- `actualModel` … ルーターが選んだ実モデル（例: `gpt-4o-2024-08-06`）
- `pool` … `mundane` / `hard`

コスト集計の `mundaneCalls` / `hardCalls` は `pool` に従う。

## HTTP 再試行（`fetchOrcaWithRetry`）

OrcaRouter への `fetch` は SDK 既定の再試行がないため、共通ヘルパーで 1 回だけ自動リトライする。

| 条件 | 動作 |
|---|---|
| 429 | `Retry-After`（秒 or HTTP-date）に従って待機。待ち上限 8 秒。超える場合は再試行しない |
| 502 / 503 / 504 | 500ms 待って 1 回再試行 |
| 400 / 401 / 403 | 再試行しない |

待機中も呼び出し元の `AbortSignal`（通常 `withTimeout` 合成）を尊重し、既存の総タイムアウトを延長しない。  
`LlmCallResult` / `GroundedSearchResult` と run イベントの `usage` に `retries`・`lastStatus` を記録する。

料金は OrcaRouter の実行時 `usage.cost_usd` のみ。コード内の固定料金表は持たない。
