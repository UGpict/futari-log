#!/usr/bin/env bash
# Cloud Agent からは実行しない。gcloud ログイン済みの手元 PC 用。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROJECT_ID="${PROJECT_ID:-futari-log-agent}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-futari-log}"
AR_REPO="${AR_REPO:-futari-log}"
DEPLOY_RUNTIME="${DEPLOY_RUNTIME:-MOCK}"
ENV_FILE="${ENV_FILE:-$ROOT/.env.local}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud がありません。Google Cloud SDK を入れてから再実行してください。" >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "node がありません。" >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE がありません。Firebase / Orca / Maps の値を入れてから再実行してください。" >&2
  exit 1
fi

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n1 || true)"
if [[ -z "$ACCOUNT" ]]; then
  echo "gcloud にログインしていません。手元 PC で次を実行してください:" >&2
  echo "  gcloud auth login" >&2
  echo "  gcloud auth application-default login" >&2
  echo "  gcloud config set project $PROJECT_ID" >&2
  exit 1
fi

env_get() {
  local key="$1"
  node -e '
    const fs = require("fs");
    const key = process.argv[1];
    const text = fs.readFileSync(process.argv[2], "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      if (line.slice(0, eq) === key) {
        process.stdout.write(line.slice(eq + 1));
        process.exit(0);
      }
    }
  ' "$key" "$ENV_FILE"
}

require_env() {
  local key="$1"
  local value
  value="$(env_get "$key")"
  if [[ -z "$value" ]]; then
    echo "$ENV_FILE に $key がありません。" >&2
    exit 1
  fi
  printf '%s' "$value"
}

ORCAROUTER_API_KEY="$(require_env ORCAROUTER_API_KEY)"
GOOGLE_MAPS_API_KEY="$(require_env GOOGLE_MAPS_API_KEY)"
FIREBASE_API_KEY="$(require_env NEXT_PUBLIC_FIREBASE_API_KEY)"
FIREBASE_AUTH_DOMAIN="$(env_get NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN)"
FIREBASE_APP_ID="$(require_env NEXT_PUBLIC_FIREBASE_APP_ID)"
ORCA_BASE="$(env_get ORCAROUTER_BASE_URL)"
ORCA_MUNDANE="$(env_get ORCAROUTER_MUNDANE_MODEL)"
ORCA_HARD="$(env_get ORCAROUTER_HARD_MODEL)"
FIREBASE_AUTH_DOMAIN="${FIREBASE_AUTH_DOMAIN:-$PROJECT_ID.firebaseapp.com}"
ORCA_BASE="${ORCA_BASE:-https://api.orcarouter.ai/v1}"
ORCA_MUNDANE="${ORCA_MUNDANE:-orcarouter/futari-mundane}"
ORCA_HARD="${ORCA_HARD:-orcarouter/futari-hard}"

echo "project=$PROJECT_ID region=$REGION service=$SERVICE account=$ACCOUNT runtime=$DEPLOY_RUNTIME"

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  firestore.googleapis.com \
  identitytoolkit.googleapis.com \
  firebase.googleapis.com \
  places.googleapis.com \
  routes.googleapis.com \
  workflows.googleapis.com

if ! gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION"
fi

if ! gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database='(default)' \
    --location="$REGION" \
    --type=firestore-native
fi

upsert_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- >/dev/null
  fi
  echo "secret $name ok"
}

upsert_secret ORCAROUTER_API_KEY "$ORCAROUTER_API_KEY"
upsert_secret GOOGLE_MAPS_API_KEY "$GOOGLE_MAPS_API_KEY"
upsert_secret NEXT_PUBLIC_FIREBASE_API_KEY "$FIREBASE_API_KEY"
upsert_secret NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN "$FIREBASE_AUTH_DOMAIN"
upsert_secret NEXT_PUBLIC_FIREBASE_APP_ID "$FIREBASE_APP_ID"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

grant() {
  local member="$1"
  local role="$2"
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$member" \
    --role="$role" \
    --quiet >/dev/null
}

grant "$CB_SA" roles/run.admin
grant "$CB_SA" roles/iam.serviceAccountUser
grant "$CB_SA" roles/artifactregistry.writer
grant "$CB_SA" roles/secretmanager.secretAccessor
grant "$CB_SA" roles/logging.logWriter
grant "$COMPUTE_SA" roles/run.admin
grant "$COMPUTE_SA" roles/iam.serviceAccountUser
grant "$COMPUTE_SA" roles/artifactregistry.writer
grant "$COMPUTE_SA" roles/secretmanager.secretAccessor
grant "$COMPUTE_SA" roles/datastore.user
grant "$COMPUTE_SA" roles/firebaseauth.admin
grant "$COMPUTE_SA" roles/logging.logWriter
grant "$COMPUTE_SA" roles/workflows.invoker

if command -v firebase >/dev/null 2>&1; then
  firebase use "$PROJECT_ID" --non-interactive >/dev/null 2>&1 || true
  firebase deploy --only firestore:rules,firestore:indexes --project "$PROJECT_ID" || \
    echo "firestore rules のデプロイはスキップ（firebase login を確認）"
else
  echo "firebase-tools が無いので firestore.rules は未デプロイ。npm i -g firebase-tools のあと firebase deploy --only firestore:rules,firestore:indexes"
fi

IMAGE_TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
DEMO_CALENDAR_STICKERS="${DEMO_CALENDAR_STICKERS:-false}"
DEMO_CALENDAR_ANCHOR_DATE="${DEMO_CALENDAR_ANCHOR_DATE:-2026-09-21}"
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE="$SERVICE",_AR_REPO="$AR_REPO",_APP_RUNTIME="$DEPLOY_RUNTIME",_ORCA_BASE="$ORCA_BASE",_ORCA_MUNDANE="$ORCA_MUNDANE",_ORCA_HARD="$ORCA_HARD",_TAG="$IMAGE_TAG",_DEMO_CALENDAR_STICKERS="$DEMO_CALENDAR_STICKERS",_DEMO_CALENDAR_ANCHOR_DATE="$DEMO_CALENDAR_ANCHOR_DATE"

CLOUD_RUN_URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
RUN_HOST="${CLOUD_RUN_URL#https://}"
export PROJECT_ID RUN_HOST

echo "Cloud Run URL: $CLOUD_RUN_URL"

if ! gcloud secrets describe WORKFLOW_INVOKE_SECRET >/dev/null 2>&1; then
  node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" \
    | gcloud secrets create WORKFLOW_INVOKE_SECRET --data-file=- >/dev/null
  echo "secret WORKFLOW_INVOKE_SECRET ok"
else
  echo "secret WORKFLOW_INVOKE_SECRET exists"
fi

gcloud workflows deploy futari-propose \
  --location="$REGION" \
  --source="$ROOT/workflows/propose.yaml" \
  --service-account="$COMPUTE_SA"

gcloud run services update "$SERVICE" \
  --region="$REGION" \
  --update-env-vars="PLAN_ORCHESTRATOR=workflows,PUBLIC_BASE_URL=$CLOUD_RUN_URL,WORKFLOW_NAME=futari-propose,WORKFLOW_LOCATION=$REGION,ENABLE_EVENT_CATALOG=false,INGEST_OIDC_SERVICE_ACCOUNT=$COMPUTE_SA,ORCAROUTER_SEARCH_MODEL=google/gemini-2.5-flash" \
  --update-secrets=WORKFLOW_INVOKE_SECRET=WORKFLOW_INVOKE_SECRET:latest

echo "workflow: https://console.cloud.google.com/workflows/workflow/$REGION/futari-propose/executions?project=$PROJECT_ID"

node <<'NODE'
const { execSync } = require("node:child_process");
const project = process.env.PROJECT_ID;
const host = process.env.RUN_HOST;
const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;

async function main() {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const get = await fetch(url, { headers });
  if (!get.ok) {
    console.error(`Identity Toolkit GET ${get.status}: 匿名 Auth と許可ドメインは Firebase Console で設定してください。`);
    console.error(`https://console.firebase.google.com/project/${project}/authentication/settings`);
    process.exit(0);
  }
  const cfg = await get.json();
  const domains = new Set(cfg.authorizedDomains || []);
  for (const d of [host, `${project}.firebaseapp.com`, `${project}.web.app`, "localhost"]) {
    domains.add(d);
  }
  const patch = await fetch(`${url}?updateMask=signIn.anonymous,authorizedDomains`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      signIn: { anonymous: { enabled: true } },
      authorizedDomains: [...domains],
    }),
  });
  if (!patch.ok) {
    console.error(`Identity Toolkit PATCH ${patch.status}: 許可ドメインは Console で Cloud Run URL を追加してください。`);
    process.exit(0);
  }
  console.log(`authorized domain ok: ${host}`);
}
main().catch((error) => {
  console.error(error);
  process.exit(0);
});
NODE

echo "health:"
curl -sS "$CLOUD_RUN_URL/api/health" || true
echo
echo
echo "ブラウザで開く: $CLOUD_RUN_URL"
echo "通し確認: DEMO_BASE_URL=$CLOUD_RUN_URL npm run demo:live"
echo "LIVE にする場合: DEPLOY_RUNTIME=LIVE npm run deploy:cloudrun"
