# Plan: 信頼性ロードマップ（1→2→3）

Spec: [`docs/specs/reliability-roadmap.md`](../specs/reliability-roadmap.md)  
Design: [`docs/design/reliability-roadmap.md`](../design/reliability-roadmap.md)

進捗は上から順。**Phase 1 完了前に Phase 2/3 の本番変更を始めない。**

---

## Phase 0 — 合意・準備

- [ ] この spec/design/plan をレビューし、シナリオ族と指標定義に異論がないことを確認する
- [ ] 作業ブランチ方針: `feat/eval-harness` → 以降 Phase ごとにブランチ
- [x] `npm run eval` スクリプト名と CI job 名を決める（案: `eval` / `Eval harness`）

---

## Phase 1 — Eval harness（最優先）

### 1.1 骨格

- [x] `evals/` ディレクトリと README（実行方法・fixture 書き方）
- [x] `EvalScenario` 型（Zod）を `evals/harness/schema.ts` に置く
- [x] `scripts/run-evals.ts` + `package.json` の `"eval"`
- [x] MOCK 実行器: PlanningInput + stubs → `orchestratePlanning`（または薄いラッパ）
- [x] `onHttp` 集計で provider 別 api_calls
- [x] 結果 JSON + 終了コード

### 1.2 メトリクス

- [x] `plan_success` / `constraint_violation` / `unnecessary_confirmation` / `api_calls` / `latency_ms` / `cost`
- [x] expected との assert（questionId / forbidIssueCodes / maxApiCalls / forbidSpotIds / replanChangedFirstSpot / requireTimeShift / requireFixedAppointment / forbidOutdoor / forbidHaversineAssumption / requireReflectAction / memoryInfluences）
- [x] サマリ表（family 別 pass rate）
- [x] `constraint_violation` は domain `isConstraintIssue`（ERROR/UNKNOWN）/ `hasConstraintViolation` を真源に

### 1.3 最小 24 fixtures

各族 2〜3。stubs は決定論。現状 **26 fixtures**（**26 pass / 0 fail / 0 skip** 目標）。

- [x] rain ×2 — `forbidOutdoor`
- [x] full（満席/代替）×2 — `SPOT_FULL` → CLOSED inject + `forbidSpotIds`
- [x] long_walk ×3
- [x] hours（営業時間外）×2
- [x] must（競合・未達）×3
- [x] replan ×3 — replace + time (`requireTimeShift` / ゆっくり dwell) + protected (`targetLockedItem` → `q_replan_no_change`)
- [x] fixed（固定予約）×2 — `requireFixedAppointment`
- [x] api_fail（Places/Routes）×3 — Routes は `forbidHaversineAssumption` + `TRAVEL_UNKNOWN`
- [x] reflect_schema（旧称 llm_bad_json）×2 — Zod schema 検証のみ。`callLLM`→repair の E2E ではない
- [x] memory_conflict ×2 — `reflect_analyze` NOTE_CONFLICT mockOverride / NEXT_DATE `seedMemories` + influence assert

### 1.4 CI・ドキュメント

- [x] `.github/workflows/ci.yml` に `npm run eval`（MOCK）
- [x] README に「改善の測り方」節を短く追記
- [ ] PR: Eval harness + 明示した製品セマンティクス修正（下記 Honesty）
- [x] Follow-up: stronger assert semantics（`feat/eval-assert-semantics`）

### Honesty（製品挙動に触れる変更）

Phase1 は「eval 専用」に見えても、次は本番コード経路に載る:

- `ProviderCtx.stubs` — eval 注入のため実 `searchSpots` / `estimateTravel` を経由
- `SPOT_FULL` overlay → `CLOSED`（満席スポットを planner が使えないようにする製品セマンティクス修正）
- `reflect_schema` fixtures — Zod schema 検証のみ（LLM bad-JSON resilience E2E ではない）
- `reflect_analyze` — `analyzeReflectionNote({ mockOverride })` の MOCK stub（LIVE `callLLM`→repair E2E ではない）
- REPLAN `ゆっくり` — `buildPlan` が滞在を延ばし `diff.timeShifts` を出す（preferRest と整合）

### 1.5 拡張（Phase1 完了後でも可）

- [ ] 24 → 40〜50 に増やす（新規族）
- [ ] REPLAY モード接続（任意）
- [x] replan time / protected の assert 強化
- [x] memory_conflict を reflect harness に接続（MOCK `mockOverride` / seedMemories。LIVE callLLM E2E ではない）
- [x] 優先シナリオの強い assert（replan / full / fixed / rain / api_fail routes）

**Exit criteria:** CI で eval 緑。ローカルで指標 JSON が出る。

---

## Phase 2 — 本番運用ガードレール

### 2.1 計測の出口

- [ ] provider / LLM 呼び出しで構造化ログ or Cloud Monitoring カスタムメトリクス
- [ ] Places / Routes / LLM cost・latency・error を同一ダッシュボード用ラベルで出す

### 2.2 保護

- [ ] uid/IP rate limit（places_search / session_create / run_start / reflect）
- [ ] API 別日次 budget（超過時は明確な 429/503）
- [ ] Places / Routes / Orca の circuit breaker

### 2.3 Synthetic + 監視

- [ ] Cloud Scheduler API 有効化（イベント ingest とは別ジョブ）
- [ ] `/api/internal/synthetic/...` + OIDC
- [ ] Phase1 fixture のうち 3〜5 本を synthetic に流用
- [ ] Dashboard `futari-log production`
- [ ] Alert: budget / error rate / synthetic fail / breaker OPEN

### 2.4 検証

- [ ] staging または本番で意図的に rate/budget を踏んで応答を確認
- [ ] docs/cloud-run.md に運用手順を追記

**Exit criteria:** 一画面で Places/Routes/LLM が見える。alert が鳴る経路を1回実証。

---

## Phase 3 — orchestrator 状態機械化

### 3.1 前提

- [ ] Phase1 eval が緑のまま（回帰の足場）
- [ ] Step 契約型と `Ports` を `src/server/agent/steps/` に追加

### 3.2 切り出し順（1 PR = 1〜2 Step）

- [ ] Validate (pre) — エリア・unsupported
- [ ] Gather — scout/weather/catalog
- [ ] Select — planner/MUST
- [ ] Enrich — openings（price 非同期は境界明示）
- [ ] Route — travel/walk
- [ ] Validate (post) — validatePlan/TRAVEL_UNKNOWN
- [ ] Approval / Commit — 既存 apply 経路と接続
- [ ] `orchestratePlanning` をファサード化（中身は Step 列）

### 3.3 横断

- [ ] WAIT → checkpoint → answerQuestion 再開
- [ ] Step 単位 metrics / events
- [ ] Step 単位単体テスト + eval 全緑

**Exit criteria:** 巨大関数がファサード化し、新規制約は Step 追加または Step 内修正で済む。

---

## 最初の実装コミット（次に手を付けるもの）

1. Phase 0 の合意確認
2. Phase 1.1 骨格（空 fixture 1 本でも `npm run eval` が通るところまで）

それ以外（UI・新機能・Scheduler イベント収集）はこのプランの外。
