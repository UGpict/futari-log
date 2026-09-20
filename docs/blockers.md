# 阻害要因

最終更新: 2026-09-19

| 項目 | 状態 | 利用者が用意するもの |
|---|---|---|
| Firebase Auth / Firestore | BLOCKED | プロジェクト、匿名 Auth、許可ドメイン、サービスアカウントまたは ADC |
| OrcaRouter | BLOCKED | `ORCAROUTER_API_KEY`、mundane/hard の Named Router 実名 |
| Google Places / Routes | BLOCKED | `GOOGLE_MAPS_API_KEY`（Places New と Routes を有効化） |
| 東京発表会場 | BLOCKED | 会場住所と最寄り駅。未提供のため開発デモは名古屋駅周辺を**明示**して使用。発表エリア確定とは言わない |
| LIVE 5連成功 | 未実施 | 上記キー。モック連続は `npm run demo:five` で 5/5 |
| モック通し | 実施済み | `demo:live` PASS、`demo:five` 5連続成功（同一版） |
| 画面収録 | 未収録 | 成功した実実行の後にブラウザー収録 |
| Named Router 名 | 未確認 | ダッシュボードの実際の router 名。`orcarouter/mundane` はプレースホルダ |

モック実行は独立して動作する。LIVE 合格判定には使わない。
