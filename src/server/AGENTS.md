# サーバー

認証、Firestore / ファイルストア、LLM、Places/Routes、プランナー。
`app/api` 以外から UI に出さない。秘密は `src/config/env.ts` のみ。

計画 run は `src/server/agent/` の複数エージェントが分担する。Cloud Run では Cloud Workflows `futari-propose` が **gather → propose** を呼ぶ。ローカルは worker。

- `scout` 候補検索（Places。同一エリアはアジア/東京の日付で1回だけ）
- `weather` 天気（予報日×地点で1回。シナリオ注入は都度）
- `planner` 候補選定（LLM しない。取得済み候補から決定論）
- `place` 営業時間と料金（spot ごと当日1回）
- `travel` 移動時間（区間×日付で1回。LIVE では直線距離で埋めない）
- 計画データは `couples/{id}` 配下の用途別ドキュメント（sessions / runs / events / planVersions / memories / approvals）。`sys/root` の単一 JSON は使わない（残置・移行元）。
- イベントカタログは `catalogEvents` / `catalogVenues` / `catalogIngestRuns`（アプリ本体と独立）。検索は OrcaRouter の Gemini `googleSearch`（native generateContent）。一覧の PARTIAL と確定プラン適用は分ける。ENABLE_EVENT_CATALOG でプラン接続。選択イベントが使えないときは Places に黙って置き換えず `q_event_fallback`。
- エージェント記憶は couple の `agentMemories`（画面契約には出さない）
