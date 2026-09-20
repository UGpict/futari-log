# Cloud Workflows で行程を提案する

ローカル（MOCK）は今までどおり in-process worker。Cloud Run は `PLAN_ORCHESTRATOR=workflows` で、提案を Cloud Workflows の2ステップにする。

1. **gather** — Places / 天気を取る。同じエリアならアジア/東京の日付で1回
2. **propose** — 取ってある候補から決定論的に行程を組む

コンソール: [futari-propose の実行](https://console.cloud.google.com/workflows/workflow/asia-northeast1/futari-propose/executions?project=futari-log-agent)

`npm run deploy:cloudrun` が Workflows API、`WORKFLOW_INVOKE_SECRET`、ワークフロー本体、Cloud Run の `PUBLIC_BASE_URL` を揃える。内部 HTTP はユーザー Cookie ではなくその秘密だけ。起動に失敗したら Cloud Run 内で `executeRun` に落とす。
