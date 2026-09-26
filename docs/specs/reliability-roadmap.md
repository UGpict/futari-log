# Spec: Eval / Ops / Orchestrator 状態機械（信頼性ロードマップ）

最終更新: 2026-09-26

## 目的

機能追加より先に、**改善できる計測基盤**と**本番の破壊を防ぐガード**と**変更しやすい orchestrator** をこの順で揃える。

優先順位（固定）:

1. Eval harness（シナリオ fixture + 毎回の指標）
2. 本番運用ガードレール（rate / budget / breaker / synthetic / dashboard / alert）
3. `orchestratePlanning` の状態機械化（Step 契約）

## 非目標（このロードマップではやらない）

- 新デート体験・新 UI 機能の追加
- grounding で候補を増やす経路の復活
- Cloud Scheduler / イベントカタログの本番有効化
- Named Router のモデル差し替えそのもの（計測と予算の対象にはする）

## 成功の定義

| Phase | Done の条件 |
|---|---|
| 1 Eval | 20〜50 fixture をローカル/`npm run` 一本で回し、指定メトリクスが JSON/表で出る。CI で回帰が落ちる |
| 2 Ops | uid/IP rate limit・API 別 budget・外部 call circuit breaker・synthetic・Monitoring ダッシュボード・alert が本番に載る。Places/Routes/LLM コストが一画面で見える |
| 3 Steps | `orchestratePlanning` が Validate→Gather→Select→Enrich→Route→Validate→Approval→Commit の Step 列になり、各 Step が単体テスト・retry・metrics 境界を持つ |

## Phase 1 — Eval harness

### 必須シナリオ族（各 2〜5 fixture、合計 20〜50）

| 族 | ねらい |
|---|---|
| 雨 | weather overlay / 屋内優先 |
| 満席 | 代替・WAITING か失敗の誠実さ |
| 長距離徒歩 | walk limits / q_long_walk / TRANSIT 提案 |
| 営業時間外 | OPENING / self-correct / unmet |
| MUST 競合 | q_must_overflow / q_must_unmet |
| 再計画 | REPLAN replace / time / 保護アイテム |
| 固定予約 | TIME_FIXED ロック・挟み込み |
| API failure | Places/Routes HTTP 失敗の扱い（直線距離で埋めない） |
| reflect schema（旧 LLM invalid JSON） | Zod schema 検証のみ（`path: reflect_schema`）。`callLLM`→repair のフル E2E ではない |
| memory conflict | NOTE_CONFLICT / 承認後の NEXT_DATE 束縛 |

### 毎回測る指標

| 指標 | 定義（初期） |
|---|---|
| `plan_success` | 確定可能な Plan ができた（WAITING のみは success=false、ただし expected outcome と一致すれば pass） |
| `constraint_violation` | validatePlan ERROR / 必須 MUST 未達 / 直線距離代用 など |
| `unnecessary_confirmation` | expected が auto-continue なのに WAITING_INPUT になった回数 |
| `api_calls` | ProviderCtx `httpAttempts` + provider 別カウント |
| `latency_ms` | orchestrate / run 壁時計 |
| `cost` | 記録された llmJpy / 外部 call 概算（maps は call 数、LLM は usage） |

### 合否

- fixture ごとに `expected`（outcome: SUCCEEDED \| WAITING_INPUT \| FAILED、questionId?、forbiddenIssues?）を持つ
- harness は expected との差分で fail。メトリクスは sidecar JSON（トレンド用）

## Phase 2 — 本番運用ガードレール

### 必須

- **uid / IP rate limiting**（匿名含む）。プラン作成・Places 検索・LLM 系を別枠
- **API 別 budget**（日次/セッション）: Places Nearby/Text、Routes、OrcaRouter（mundane/hard/search）
- **external call circuit breaker**: 連続失敗で OPEN、半開で probe
- **production synthetic test**: 固定シナリオを定期実行（Scheduler は Phase2 で最小ジョブのみ可。イベント ingest とは別）
- **Cloud Monitoring dashboard**: Places / Routes / LLM cost・latency・error・breaker state
- **alert**: budget 超過、error rate、synthetic fail、breaker OPEN

### 非目標（Phase2）

- マルチリージョン
- 完全な課金予測エンジン

## Phase 3 — Orchestrator 状態機械

### Step 列（契約）

```
Validate → Gather → Select → Enrich → Route → Validate → Approval → Commit
```

各 Step は `Step<I, O>`:

- 純関数に近い境界（I/O は明示、副作用は ports）
- 失敗は `Continue | Wait | Fail` に正規化
- retry は Step 境界のみ
- metrics / event 名は Step id に紐づく

### 移行制約

- 挙動互換を Eval harness で担保してから切る
- 巨大関数の一括書き換え禁止。Step 抽出を PR 単位で

## 依存関係

```
Phase1 ──完了──► Phase2（synthetic は Phase1 fixture を再利用）
Phase1 ──完了──► Phase3（回帰の足場）
Phase2 と Phase3 は並列可だが、デフォルトは 1→2→3
```

## 用語

- **fixture**: 入力 PlanningInput + overlays + stubbed provider 応答 + expected
- **harness**: fixture を MOCK/REPLAY で実行しメトリクスと合否を出すランナー
- **synthetic**: 本番相当エンドポイントへの定期ヘルス（認証・秘密は OIDC）
