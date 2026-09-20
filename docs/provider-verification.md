# 公式資料の確認ログ（2026-09-19）

秘密値は記載しない。アプリの環境変数名はベンダー仕様ではない。

## OrcaRouter

- 入口: [Quickstart](https://docs.orcarouter.ai/getting-started/quickstart.md)
- Chat Completions: `POST {base}/chat/completions`（既定 base `https://api.orcarouter.ai/v1`）
- OpenAI 互換。`Authorization: Bearer sk-orca-...`
- 構造化: [Structured outputs](https://docs.orcarouter.ai/advanced/structured-outputs.md)
  - `response_format: { type: "json_object" }` と `json_schema` を確認
  - Anthropic 上流は `response_format` 非対応。送るモデルを Named Router 側で OpenAI/Gemini/Grok 系に限定する
- 料金: [Per-request cost](https://docs.orcarouter.ai/operations/per-request-cost.md)
  - ヘッダー `X-OrcaRouter-Include-Cost: true` で `usage.cost_usd`
- Named Router: [named-routers](https://docs.orcarouter.ai/routing/named-routers)
  - 呼び出しは `model: "orcarouter/{name}"`
  - ダッシュボード未作成の名前を想像して送らない。未作成なら BLOCKED
- Gemini Grounding: [Web search](https://docs.orcarouter.ai/advanced/web-search.md)
  - Chat: `tools: [{ type: "function", function: { name: "googleSearch" } }]`
  - Native: `POST {origin}/v1beta/models/google/gemini-3.5-flash:generateContent` + `tools: [{ googleSearch: {} }]`
  - 認証は既存の `ORCAROUTER_API_KEY`。Google の `GEMINI_API_KEY` は不要
  - カタログ確認済み: `google/gemini-2.5-flash`, `google/gemini-3.5-flash`（1.5 は無し）
  - Native 応答に `groundingMetadata.webSearchQueries` / `searchEntryPoint` が載る。Chat Completions 側は本文だけ
  - 画像はモデル生成ではなく、引用ページの `og:image`

実装: `src/server/llm/index.ts`（計画）と `src/server/providers/geminiGrounding.ts`（画像）。キーが無ければモック推論（課金 0、actualModel=`mock/planner-v0.5`）。

## Google Places API (New)

- Nearby Search: `POST https://places.googleapis.com/v1/places:searchNearby`
- FieldMask 必須。検索は `places.id,places.displayName,places.location,places.types,places.primaryType,places.googleMapsUri,places.photos.name,places.photos.authorAttributions`
- Details は上記に加え `photos.name,photos.authorAttributions`
- Place Photos: `GET https://places.googleapis.com/v1/{photos.name}/media?maxWidthPx=800&skipHttpRedirect=true` → `photoUri`（クライアントに API キーを載せない）
- 写真は店舗 ID に紐づく。同名の別店舗を拾わない
- `authorAttributions.displayName` / `uri` を `imageAttributions` として返す
- `priceRange` が無い場合は円額を作らず UNKNOWN
- 空席フィールドは提供されない

## Google Routes API

- `POST https://routes.googleapis.com/directions/v2:computeRoutes`
- `travelMode`: `WALK` / `TRANSIT` / `DRIVE` を確認
- `departureTime` は RFC3339。過去の出発は TRANSIT のみ
- FieldMask: `routes.duration,routes.distanceMeters`
- LIVE で失敗したとき直線距離を実移動時間として使わない

## Open-Meteo

- `GET https://api.open-meteo.com/v1/forecast`
- 必須: latitude, longitude
- hourly `precipitation,weather_code`
- 既定 7 日、最大 16 日
- キー不要。doctor で実疎通する
