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
| LIVE 振り返り保存→分析 | **実施・失敗**（下記 LIVE検証。`schema validation failed`） |
| OrcaRouter 経由の reflect | LIVE で `gpt-4o-mini-2024-07-18` を呼んだが schema 不合格 |
| ホーム振り返り UI | 同日1セッション時に API 保存。複数・0件は localStorage のみ。旧 local は削除しない |
| 本番 Scheduler | 変更・有効化なし |

## LIVE検証（2026-09-21・**途中失敗で停止**）

| 項目 | 値 |
| --- | --- |
| revision | `futari-log-00020-qz9` |
| commit | `f0ae67e`（`177f205` + DEMO_DATE 除去） |
| URL | https://futari-log-w5a2hgpkiq-an.a.run.app |
| `ENABLE_EVENT_CATALOG` | `false` |
| couple / session | `cpl_9b31d148195cf4a9` / `ses_5d67809bbe2f12a0` |
| INITIAL_PLAN run | `run_08c0143f92735dd6` → **SUCCEEDED** |
| REFLECTION run | `run_09330aea58f51c41` → **FAILED**（`schema validation failed`） |
| 到達点 | セッション作成 → 初回プラン表示 → reflections POST → REFLECTION enqueue → LLM 呼出 → **失敗** |
| 未到達 | WAITING_INPUT（分析質問） / MEMORY 承認 / USER_CONFIRMED / NEXT_DATE 束縛 |

リトライなし。コード修正なし。生ログ: `docs/reports/live-e2e-architecture-v2-raw.json`。

### 初回プラン表示 vs REFLECTION（対比）

| 区間 | 開始 (UTC) | 終了 (UTC) | 所要 |
| --- | --- | --- | --- |
| **初回プラン表示まで**（run `createdAt`→`finishedAt`） | 2026-09-21T02:22:52.610Z | 2026-09-21T02:23:58.758Z | **66,148 ms** |
| 同上（イベント `RUN_STARTED`→`RUN_FINISHED`） | 02:22:53.892Z | 02:23:59.331Z | **65,439 ms** |
| 同上（クライアント POST→terminal） | 02:22:51.941Z | 02:24:00.070Z | **68,129 ms** |
| **REFLECTION enqueue→完了（失敗）**（run `createdAt`→`finishedAt`） | 02:24:02.486Z | 02:24:06.949Z | **4,463 ms** |
| 同上（イベント MODEL_SELECTED `latencyMs`） | — | — | LLM 壁時計 **2,651 ms**（`ok:false`） |

→ 初回プラン待ち ≈ **66 s**。REFLECTION は ≈ **4.5 s** で schema 失敗により打ち切り（承認フロー未到達）。

### ingest

| 観点 | 結果 |
| --- | --- |
| 実装 | 初回プラン経路は `suggestCatalogEventsForPlan({ enabled: env.enableEventCatalog && ... })`（`orchestrate.ts`）。`ENABLE_EVENT_CATALOG=false` のため即空返り。`ingestEvents` はプラン生成から呼ばれない（別 API / Scheduler）。 |
| 実挙動 | 本セッション中の `catalogIngestRuns` 新規なし（直近 ingest は 2026-09-20）。 |
| プラン待ちに占める ingest | **0 ms**（同期待ちも非同期完了待ちもなし）。ingest 完了を待たずにプランを出せる（本設定では ingest 自体がクリティカルパス外）。 |

### 初回プラン待ちに LLM 呼び出しは含まれるか

| 種類 | 含まれるか | 根拠 |
| --- | --- | --- |
| 候補選定 LLM | **含まれない** | `MODEL_SELECTED` = `deterministic/planner`、tokens=0 / latencyMs=0（`planner.ts` の決定論経路） |
| 行程本体 `buildPlan` | LLM なし | Places Routes + `hydratePlacePhotos`（Places） |
| **スポット画像 Gemini grounding** | **含まれる（ブロッキング）** | `execute.ts` **283–301** の `attachSpotImages` → `geminiGrounding.ts`。イベント: `gemini-grounding HTTP #24` **02:23:06.063Z** → 完了ログ **02:23:57.771Z** ≈ **51,708 ms**。この後に初めて `PLAN_APPLIED`（02:23:59.135Z） |

### buildPlan 単体（イベント代理）

`orchestrate.ts` は `travel` TOOL_STARTED の直後に `await buildPlan(...)`。

| 代理区間 | 開始 | 終了 | 所要 |
| --- | --- | --- | --- |
| travel TOOL_STARTED → TOOL_COMPLETED | 02:23:01.461Z | 02:23:03.866Z | **2,405 ms** |

（上記の後に別処理として `attachSpotImages` が約 52 s。これは buildPlan 外。）

### LLM 呼び出し一覧（本通し）

| フェーズ | モデル | prompt | completion | costUsd | costJpy | latencyMs | ok |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INITIAL_PLAN 選定 | `deterministic/planner` | 0 | 0 | 0 | 0 | 0 | true |
| INITIAL_PLAN 画像 | Gemini grounding（イベント上 `gemini-grounding`；usage トークン未記録） | — | — | — | — | ≈51,708（イベント時刻差） | 画像ヒットなし |
| REFLECTION | `gpt-4o-mini-2024-07-18` | 460 | 82 | 0.000118 | 0.017523 | 2651 | **false**（schema validation failed） |

run.cost 集計は INITIAL / REFLECTION とも `mundaneCalls=0`（deterministic 非課金扱い、reflect は `ok:false` で加算されず）。

### Workflows `futari-propose`

| run | execution id | start | end | 手動 trigger |
| --- | --- | --- | --- | --- |
| INITIAL_PLAN | `f19a1766-d07d-41e7-9d30-54c2f24e180f` | 02:22:52.940Z | 02:23:59.557Z | **不要**（`dispatchProposal` 自動） |
| REFLECTION | `2c4ca0f9-1e82-467f-9b39-8205f4b05fac` | 02:24:02.979Z | 02:24:07.556Z | **不要**（`kickRun`→workflows、`kind=REFLECTION`） |

どちらも `state=SUCCEEDED`（Workflow 自体は完了。中の propose が REFLECTION を FAILED にした）。

### duplicated 条件付き再 kick

**該当なし**（reflections POST は 1 回、`duplicated=false`、再 POST なし）。

### 失敗箇所（修正せず停止）

- **現象**: REFLECTION `status=FAILED` / `error=schema validation failed`。reflection `analysisStatus=FAILED`。approvals 0 件。
- **コード**: `src/server/agent/reflectAnalyze.ts`（`callLLM` + `reflectionAnalysisActionSchema`）および `src/server/llm/index.ts`（schema 失敗時 `error: "schema validation failed"`、repair 後も失敗）。
- **イベント**: `MODEL_SELECTED` usage.ok=false → `RUN_FINISHED`「振り返り分析失敗（本文は保持）」。
- 以降の承認・NEXT_DATE 束縛は未実施。

## 未実施 / TODO

- 同日複数セッションの明示選択 UI
- 承認待ち専用画面（候補は memory API に `approvalId` 付与済み）
- LIVE 通しの成功完走（上記 schema 失敗の修正後に再計測）
- 本番マージ・定時ジョブ有効化（別判断）
