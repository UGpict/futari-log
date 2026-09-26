# Design: 信頼性ロードマップ（Eval / Ops / Steps）

最終更新: 2026-09-26  
Spec: [`docs/specs/reliability-roadmap.md`](../specs/reliability-roadmap.md)

## 現状の足場（再利用）

| 既存 | 活かし方 |
|---|---|
| `ProviderCtx.overlays` / scenarios | 雨・満席などの deterministic overlay |
| `src/fixtures/` | UI 専用。Eval 本体には載せない（LIVE 汚染禁止） |
| `ReplayManifest` / replay-export | Phase1 後半で REPLAY 実行の入力源に接続 |
| `validatePlan` / walkLimits / serviceArea | constraint・unnecessary confirmation の判定源 |
| run `cost` / events `MODEL_SELECTED` | LLM cost・latency の採取 |
| `scripts/live-smoke-*.ts` | Phase2 synthetic の原型 |
| `orchestrateGather` / `orchestratePlanning` 分離 | Step 化の最初の切り口 |

## Phase 1 — Eval harness

### 配置

```
evals/
  README.md
  scenarios/           # 1 fixture = 1 JSON（または TS）
    rain-indoor-01.json
    ...
  expected/            # 省略可（scenario 内に expected を同居でも可）
  harness/
    run.ts             # CLI 入口
    load.ts
    metrics.ts
    assert.ts
scripts/run-evals.ts   # npm run eval
```

フロント境界を汚さない。`evals/` はサーバー／ドメインのみ import。

### Fixture スキーマ（案）

```ts
type EvalScenario = {
  id: string;
  family: "rain" | "full" | "long_walk" | "hours" | "must" | "replan" | "fixed" | "api_fail" | "reflect_schema" | "memory_conflict";
  input: PlanningInput;           // または最小部分 + defaults
  overlays?: ScenarioOverlay[];   // WEATHER 等
  stubs?: {                       // MOCK 応答の上書き
    places?: Record<string, unknown>;
    routes?: Record<string, unknown>;
    weather?: unknown;
    llmReflect?: unknown;         // invalid JSON 用
  };
  expected: {
    outcome: "PLAN" | "WAITING_INPUT" | "FAILED";
    questionId?: string;
    forbidIssueCodes?: string[];
    requireIssueCodes?: string[];
    maxApiCalls?: number;
    maxLatencyMs?: number;
  };
};
```

### 実行モード

1. **MOCK+stubs**（既定・CI）: 外部 HTTP なし
2. **REPLAY**（任意）: 保存済み evidence/replay を再生
3. **LIVE_SMOKE**（手動・少数）: 本番相当。CI 既定では回さない

### メトリクス出力

- stdout: 要約表
- `evals/out/<runId>.json`: シナリオ別 metrics + pass/fail
- CI: fail があれば exit 1。メトリクス artifact を残す

### 指標の取り方

| 指標 | 採取 |
|---|---|
| plan_success | built != null && validation が確定可能（TRAVEL_UNKNOWN なし等） |
| constraint_violation | validatePlan ERROR/UNKNOWN の指定コード、または expected 外の FAIL |
| unnecessary_confirmation | expected.outcome=PLAN なのに waitingQuestion |
| api_calls | ctx.httpAttempts + provider 別 Map（harness が onHttp で集計） |
| latency_ms | Date.now 差（orchestrate のみ / 全体） |
| cost | run.cost 相当を harness 内でミラー |

### 最初の 24 fixture（最小セット）

各族 2〜3。合計 ~24 で緑にしてから 50 へ伸ばす。

## Phase 2 — 本番ガードレール

### レイヤ

```
Client → API route
          ├─ auth
          ├─ rate limit (uid + IP)
          ├─ budget check (API kind)
          └─ action / provider
                └─ circuit breaker wrapper
```

### Rate limit

- キー: `uid` 優先、無ければ IP
- 窓: 分次 + 日次
- 対象別: `places_search`, `session_create`, `run_start`, `reflect`, `approval`
- 実装候補: Firestore カウンタ（既存 backend）または Memorystore。まずは Firestore で十分

### Budget

- 設定は `src/config/settings.ts` + env 上書き
- kind: `places`, `routes`, `llm_mundane`, `llm_hard`, `llm_search`
- 超過時: 503/429 + 明確な error code（黙って MOCK に落とさない）

### Circuit breaker

- 対象: Places Nearby/Text、Routes computeRoutes、OrcaRouter
- 状態: CLOSED / OPEN / HALF_OPEN
- 永続: プロセス局所で開始可。複数 instance なら後で Firestore/Redis

### Synthetic

- Cloud Scheduler（API 有効化が必要）→ OIDC → `/api/internal/synthetic/plan-smoke`
- 中身は Phase1 の 3〜5 fixture を MOCK 相当でサーバー内実行、または固定 LIVE 地点 1 本
- 失敗で Monitoring alert

### Dashboard / Alert

- カスタムメトリクス or Cloud Logging ベース指標:
  - `futari/external_calls{provider}`
  - `futari/external_errors{provider}`
  - `futari/llm_cost_usd`
  - `futari/breaker_state{provider}`
  - `futari/rate_limited`
- ダッシュボード名: `futari-log production`
- Alert: error rate、日次 cost、synthetic fail、breaker OPEN > N 分

## Phase 3 — Orchestrator Steps

### Step 契約

```ts
type StepResult<O> =
  | { kind: "ok"; output: O }
  | { kind: "wait"; question: WaitingQuestion; checkpoint: Checkpoint }
  | { kind: "fail"; error: string; issues?: PlanIssue[] };

type Step<I, O> = {
  id: string;
  run(input: I, ports: Ports): Promise<StepResult<O>>;
};
```

### 分割マップ（現状 → Step）

| Step | 現状の塊 |
|---|---|
| Validate (pre) | サービスエリア・unsupported wish・固定予定名 |
| Gather | runScout / weather / catalog attach |
| Select | runPlanner / MUST coverage |
| Enrich | openings / price enqueue（非同期は境界外） |
| Route | estimateTravel / walk limits |
| Validate (post) | validatePlan / TRAVEL_UNKNOWN / unmet |
| Approval | waitingApproval / diff |
| Commit | planHistory 書き込み・run SUCCEEDED |

### 移行手順

1. harness 緑を維持
2. `Ports` 抽出（scout/weather/travel/llm）
3. Step を1つずつ切り出し、`orchestratePlanning` はファサードに
4. checkpoint で WAIT 再開（既存 answerQuestion と接続）

### リスク

- WAIT 再開の状態が Step に散らばるとバグる → checkpoint を session/run に明示保存
- gather 日次キャッシュは Step Gather 内に閉じる

## PR 分割方針

- Phase1: harness + fixtures + CI。製品挙動ゼロではない（`ProviderCtx.stubs`、`SPOT_FULL`→`CLOSED`、reflect Zod-only）
- Phase2a: rate limit + budget + metrics emit
- Phase2b: breaker + synthetic + dashboard/alert
- Phase3a〜: Step ごと PR（各 PR で eval 緑）
