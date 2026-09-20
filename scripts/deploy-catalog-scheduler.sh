#!/usr/bin/env bash
# Cloud Run にこの版を載せたあとで実行する。鍵ファイルは使わない。
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-futari-log-agent}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-futari-log}"
JOB="${JOB:-futari-catalog-ingest}"
SA="${INGEST_OIDC_SERVICE_ACCOUNT:-}"
BASE="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
AUDIENCE="${INGEST_OIDC_AUDIENCE:-$BASE/api/internal/catalog/ingest}"
if [[ -z "$SA" ]]; then
  echo "INGEST_OIDC_SERVICE_ACCOUNT is required (service account email)" >&2
  exit 2
fi
gcloud scheduler jobs delete "$JOB" --project "$PROJECT_ID" --location "$REGION" --quiet >/dev/null 2>&1 || true
gcloud scheduler jobs create http "$JOB" \
  --project "$PROJECT_ID" \
  --location "$REGION" \
  --schedule="0 6 * * *" \
  --time-zone="Asia/Tokyo" \
  --uri="$AUDIENCE" \
  --http-method=POST \
  --oidc-service-account-email="$SA" \
  --oidc-token-audience="$AUDIENCE" \
  --attempt-deadline=180s \
  --max-retry-attempts=3 \
  --max-backoff=1h \
  --headers="Content-Type=application/json" \
  --message-body='{"genre":"展覧会"}'
echo "created $JOB -> $AUDIENCE"
