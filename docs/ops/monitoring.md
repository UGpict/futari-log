# 運用監視（Phase 2b）

最終更新: 2026-09-26

このドキュメントは **コードが emit する構造化ログ** を Cloud Monitoring に載せるための定義です。  
**GCP コンソール上のダッシュボード本体・Alert Policy の作成は、このリポジトリだけでは完了しません**（プロジェクト認証・課金・IAM が必要）。以下は人手または `gcloud` で配線するための仕様書です。

## アプリが出すメトリクス（Cloud Logging JSON）

| metric (`message` / `metric`) | 主なラベル | 出所 |
|---|---|---|
| `futari/external_calls` | `provider`, `latency_ms`, `ok`, `cost_usd?` | Places / Routes / LLM |
| `futari/external_errors` | `provider`, `latency_ms` | 同上（`ok=false` 時） |
| `futari/llm_cost_usd` | `provider`, `kind` (pool), `cost_usd` | LLM |
| `futari/rate_limited` | `bucket`, `subject` | HTTP rate limit |
| `futari/budget_exceeded` | `kind` | API day budget |
| `futari/breaker_state` | `provider`, `state` (`CLOSED`/`OPEN`/`HALF_OPEN`) | circuit breaker 遷移時 |
| `futari/synthetic_plan_smoke` | `ok`, `passed`, `failed`, `latency_ms` | `/api/internal/synthetic/plan-smoke` |

ログフィルタ例（Cloud Logging）:

```
jsonPayload.metric="futari/external_errors"
jsonPayload.metric="futari/breaker_state" AND jsonPayload.state="OPEN"
jsonPayload.metric="futari/synthetic_plan_smoke" AND jsonPayload.ok=false
jsonPayload.metric="futari/budget_exceeded"
```

### Log-based metrics（手動作成）

Monitoring → Log-based metrics で、上記 `jsonPayload.metric` ごとに Counter / Distribution を作る。

| 推奨名 | 種別 | フィルタ要点 | ラベル |
|---|---|---|---|
| `futari_external_calls` | Counter | `metric="futari/external_calls"` | `provider`, `ok` |
| `futari_external_errors` | Counter | `metric="futari/external_errors"` | `provider` |
| `futari_llm_cost_usd` | Distribution (value=`cost_usd`) | `metric="futari/llm_cost_usd"` | `provider`, `kind` |
| `futari_rate_limited` | Counter | `metric="futari/rate_limited"` | `bucket` |
| `futari_budget_exceeded` | Counter | `metric="futari/budget_exceeded"` | `kind` |
| `futari_breaker_open` | Counter | `metric="futari/breaker_state" AND state="OPEN"` | `provider` |
| `futari_synthetic_fail` | Counter | `metric="futari/synthetic_plan_smoke" AND ok=false` | （なし） |

ウィジェット定義の JSON スケッチは [`dashboard-futari-log-production.json`](./dashboard-futari-log-production.json) を参照（**インポート用の完全な Monitoring Dashboard API ペイロードではない**。ラベル名は作成した log-based metric に合わせて調整すること）。

## ダッシュボード名

**`futari-log production`**

推奨ウィジェット:

1. External calls / min（`provider` 別）
2. External error rate（errors / calls）
3. LLM cost USD（日次・pool 別）
4. Rate limited / Budget exceeded（件数）
5. Breaker state（OPEN イベント）
6. Synthetic plan-smoke 成否

## Alert 方針（説明のみ・ポリシー未プロビジョン）

| Alert | 条件案 | メモ |
|---|---|---|
| Budget exceed | `futari_budget_exceeded` が 5 分で ≥1 | 503 `API_BUDGET_EXCEEDED` と対応 |
| Error rate | `futari_external_errors` / `futari_external_calls` が 10 分で > 20%（calls≥20） | provider 別に分けるとノイズ減 |
| Synthetic fail | `futari_synthetic_fail` ≥1（または HTTP 502 on plan-smoke） | Scheduler ジョブ作成後に有効化 |
| Breaker OPEN > N 分 | `futari_breaker_open` が N=5 分窓で再発、または OPEN 後に CLOSED が無い | **プロセス局所 breaker** のため instance 再起動で消える。複数 instance 共有は follow-up |

通知チャネル（Slack / Email）はプロジェクト側で作成し、上記ポリシーに紐付ける。

## Circuit breaker（コード）

- 対象: `places` / `routes` / `orcarouter`
- 状態: CLOSED → OPEN（連続失敗）→ HALF_OPEN（`openMs` 後）→ CLOSED（連続成功）
- OPEN 時: **503 `CIRCUIT_OPEN`**（黙って MOCK に落とさない）
- 永続: **プロセスメモリのみ**。Cloud Run 複数 revision / instance では各プロセス独立。共有 state（Firestore/Redis）は次イテレーション

設定: `CIRCUIT_BREAKER` in `src/config/settings.ts`（`failureThreshold=5`, `successThreshold=2`, `openMs=60_000`）。

## Synthetic + Scheduler

手順と env は [`docs/cloud-run.md`](../cloud-run.md) の「Ops guardrails（Phase 2b）」を参照。  
ジョブ自体の Terraform / 自動プロビジョンは未同梱（シークレット・プロジェクト権限が手元に無い前提）。

## Follow-up（実 GCP 配線）

1. Log-based metrics を作成
2. Dashboard `futari-log production` を UI または Dashboard API で作成
3. Alert policy 4 本 + 通知チャネル
4. Cloud Scheduler API 有効化 + OIDC ジョブ（plan-smoke）
5. （任意）breaker 状態の multi-instance 共有
