# Cloud Run 公開（手元 PC）

Cloud Agent では **Google ログインを行いません**。この VM から `gcloud` / Cloud Run への push はできません。公開は gcloud ログイン済みの手元 PC で、次の1コマンドです。

```bash
# リポジトリ直下。`.env.local` に Firebase / OrcaRouter / Maps があること
npm run deploy:cloudrun
```

既定プロジェクトは **`futari-log-agent`**、リージョン `asia-northeast1`、サービス名 `futari-log`。上書きするときだけ:

```bash
PROJECT_ID=futari-log-agent REGION=asia-northeast1 npm run deploy:cloudrun
```

初回デプロイの `APP_RUNTIME` は **MOCK**（本物の匿名 Auth + Firestore、推論と地図はキーが無ければモック）。画面確認用。LIVE にするとき:

```bash
DEPLOY_RUNTIME=LIVE npm run deploy:cloudrun
```

終わると Cloud Run URL を表示し、`/api/health` を叩きます。ブラウザでその URL を開けば確認できます。

大会デモでカレンダーにサンプル振り返りステッカーを出すとき（LIVE のまま、MOCK/API fixture は使わない）:

```bash
# デプロイ時
DEPLOY_RUNTIME=LIVE DEMO_CALENDAR_STICKERS=true DEMO_CALENDAR_ANCHOR_DATE=2026-09-21 npm run deploy:cloudrun

# または既存 revision の env だけ更新（イメージ再ビルド不要）
gcloud run services update futari-log --region=asia-northeast1 \
  --update-env-vars=DEMO_CALENDAR_STICKERS=true,DEMO_CALENDAR_ANCHOR_DATE=2026-09-21
```

```bash
curl -sS "$CLOUD_RUN_URL/api/health"
# {"ok":true,"runtime":"MOCK","authBackend":"firebase","dataBackend":"firestore","emulator":false}

DEMO_BASE_URL="$CLOUD_RUN_URL" npm run demo:live
```

提案の実行は Cloud Workflows（`docs/workflows.md`）。gather → propose。


## スクリプトがやること

`scripts/deploy-cloud-run.sh` は次を冪等に実行します。秘密は git に出さず、`.env.local` から Secret Manager へ入れます。

1. API 有効化（Run / Artifact Registry / Cloud Build / Secret Manager / Firestore / Identity Toolkit / Places / Routes）
2. Artifact Registry `futari-log`、Firestore Native（未作成なら）
3. Secret: `ORCAROUTER_API_KEY` `GOOGLE_MAPS_API_KEY` `NEXT_PUBLIC_FIREBASE_API_KEY` `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` `NEXT_PUBLIC_FIREBASE_APP_ID`
4. Cloud Build SA と Compute SA へ IAM（Run admin、Secret Accessor、Datastore user、Firebase Auth admin など）
5. `firebase deploy --only firestore:rules,firestore:indexes`（firebase-tools があるとき）
6. `gcloud builds submit --config cloudbuild.yaml`
7. 匿名 Auth 有効化と、Cloud Run ホストの Authorized domains 追加

## このリポジトリが用意しているもの

- `firebase.json` / `.firebaserc` / `firestore.rules` … Emulator と本番ルール
- `Dockerfile` / `cloudbuild.yaml` … Web + 常駐 worker を 1 コンテナ（`PORT` 対応）
- `.gcloudignore` … `.env.local` を Cloud Build に送らない
- サーバーは Admin SDK で Firestore に書き込みます。クライアントからの直接 write はルールで拒否します
- 認証は **匿名 Auth**（Google ログインは使いません）。セッション Cookie は httpOnly

Cloud Run では worker がポーリングし続ける必要があるため、**CPU スロットリングなし・min instances 1** です。課金はその前提です。

## 手動で分ける場合

ログインだけ先に済んでいるなら、スクリプトを使わずに:

```bash
export PROJECT_ID=futari-log-agent
export REGION=asia-northeast1
gcloud config set project "$PROJECT_ID"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE=futari-log,_AR_REPO=futari-log
```

Secret と IAM が未作成だとこのコマンド単体は失敗します。そのときは `npm run deploy:cloudrun` を使ってください。

## Ops guardrails（Phase 2a / 2b）

本番破壊を防ぐためのガード。ダッシュボード / alert の **GCP 実体作成** は [`docs/ops/monitoring.md`](ops/monitoring.md) を参照（このリポジトリだけでは未配線）。

### 構造化メトリクス（Cloud Logging）

アプリは次の JSON ログを出す（`message` / `metric` が名前）:

| metric | 主なラベル |
|---|---|
| `futari/external_calls` | `provider`, `latency_ms`, `ok`, `cost_usd?` |
| `futari/external_errors` | `provider`, `latency_ms` |
| `futari/llm_cost_usd` | `provider`, `kind` (pool), `cost_usd` |
| `futari/rate_limited` | `bucket`, `subject` |
| `futari/budget_exceeded` | `kind` |
| `futari/breaker_state` | `provider`, `state` |
| `futari/synthetic_plan_smoke` | `ok`, `passed`, `failed`, `latency_ms` |

Places / Routes は `ProviderCtx.onHttp` 経路、LLM は `src/server/llm`、breaker 遷移と synthetic 結果も同スキーマで emit。

### Rate limit / API budget（2a）

- **Rate limit**（HTTP 端）: uid 優先、なければ IP。分次 + 日次。対象 `places_search` / `session_create` / `run_start` / `reflect`。超過 → **429** `{ error, code: "RATE_LIMITED" }`
- **API budget**（provider / LLM 呼び出し）: Tokyo 日次。`places` / `routes` / `llm_mundane` / `llm_hard` / `llm_search`。超過 → **503** `{ error, code: "API_BUDGET_EXCEEDED" }`。**黙って MOCK に落とさない**
- 既定値は `src/config/settings.ts`（`RATE_LIMITS` / `API_BUDGETS`）。上書きは env（例: `RATE_LIMIT_PLACES_SEARCH_PER_MINUTE`, `API_BUDGET_PLACES_PER_DAY`）
- カウンタ: `DATA_BACKEND=firestore` なら Firestore `opsCounters`、file なら `STORE_DIR/ops-counters.json`。テストは `OPS_COUNTER_BACKEND=memory`
- 既存の couple 単位 `LIMITS.maxRunsPerCouplePerDay`（store daily cap）はそのまま。API budget とは別枠

### Circuit breaker（2b・コード実装済み）

- 対象: Places Nearby/Text、Routes `computeRoutes`、OrcaRouter（`fetchOrcaWithRetry`）
- 状態: CLOSED / OPEN / HALF_OPEN（プロセス局所。複数 Cloud Run instance では共有されない → follow-up）
- HALF_OPEN は **同時 probe 1 本のみ**。他の呼び出しは OPEN 同様 **503 `CIRCUIT_OPEN`**
- OPEN 時: **503** `{ error, code: "CIRCUIT_OPEN" }`（MOCK フォールバックなし）
- 閾値: `CIRCUIT_BREAKER` in `src/config/settings.ts`

### Synthetic plan-smoke（2b）

エンドポイント: `POST /api/internal/synthetic/plan-smoke`

- 認証: Google ID トークン（OIDC）。ingest と同型（`verifyGoogleIdToken`）
- env:
  - `SYNTHETIC_OIDC_AUDIENCE`（未設定時は `PUBLIC_BASE_URL/api/internal/synthetic/plan-smoke`）
  - `SYNTHETIC_OIDC_SERVICE_ACCOUNT`（未設定時は `INGEST_OIDC_SERVICE_ACCOUNT`）
- 中身: Phase 1 fixture 5 本を **MOCK** で `evals/harness/runScenario` 再利用（LIVE 課金なし）
  - `smoke-cafe-tokyo`, `rain-indoor-01`, `hours-ok-catalog`, `fixed-time-gallery`, `outside-tokyo-nagoya`
  - **`process.env` は書き換えない**。`runWithEnvScopeAsync({ runtime: "MOCK", dataBackend: "file", storeDir })` でリクエストスコープ注入（本番 LIVE リクエストと並走してもグローバル設定を汚さない）
- 成功 200 / いずれか fail で 502。メトリクス `futari/synthetic_plan_smoke`

#### Cloud Scheduler（手動・gcloud 例）

プロジェクト権限と Secret が揃っている前提の **手順メモ**。このリポジトリはジョブ定義を自動プロビジョンしない。

```bash
# 1) Scheduler API
gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID"

# 2) 呼び出し用 SA（例）。Cloud Run invoker + 必要ならトークン作成権限
# gcloud iam service-accounts create futari-synthetic --display-name="Futari synthetic"

# 3) ジョブ（OIDC）。AUDIENCE は SYNTHETIC_OIDC_AUDIENCE と一致させる
export REGION=asia-northeast1
export SERVICE_URL="https://YOUR-CLOUD-RUN-URL"
export SA_EMAIL="futari-synthetic@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud scheduler jobs create http futari-plan-smoke \
  --location="$REGION" \
  --schedule="*/30 * * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="${SERVICE_URL}/api/internal/synthetic/plan-smoke" \
  --http-method=POST \
  --oidc-service-account-email="$SA_EMAIL" \
  --oidc-token-audience="${SERVICE_URL}/api/internal/synthetic/plan-smoke"
```

Cloud Run 側 env に `PUBLIC_BASE_URL` / `SYNTHETIC_OIDC_*`（または ingest SA 流用）を設定すること。  
イベント catalog ingest 用 Scheduler とは **別ジョブ**。

## Cloud Agent ではやらないこと

- `gcloud auth login` / `firebase login`
- 実 Firebase プロジェクトの作成
- Cloud Run への push / 公開

こちらでは `npm run dev`（Auth + Firestore Emulator）と `npm run test:emulator` で同じコードパスを検証します。
