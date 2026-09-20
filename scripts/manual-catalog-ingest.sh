#!/usr/bin/env bash
# Cloud Run 反映後に、Scheduler の前で手動の OIDC 収集を確認する。
set -euo pipefail
PROJECT_ID="${PROJECT_ID:-futari-log-agent}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-futari-log}"
SA="${INGEST_OIDC_SERVICE_ACCOUNT:-$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')}"
BASE="$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
AUDIENCE="${INGEST_OIDC_AUDIENCE:-$BASE/api/internal/catalog/ingest}"
if [[ -z "$SA" ]]; then
  echo "service account missing" >&2
  exit 2
fi
TOKEN="$(gcloud auth print-identity-token --audiences="$AUDIENCE" --impersonate-service-account="$SA" --include-email)"
echo "POST $AUDIENCE as $SA"
curl -sS -X POST "$AUDIENCE" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"genre":"展覧会"}'
echo
