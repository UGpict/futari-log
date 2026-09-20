# 阻害要因

最終更新: 2026-09-20

| 項目 | 状態 | 利用者が用意するもの |
|---|---|---|
| Firebase Auth / Firestore | Emulator PASS | 本番公開は手元 PC でプロジェクト・匿名 Auth・許可ドメイン・Cloud Run SA。Cloud Agent では Google ログインしない |
| OrcaRouter | BLOCKED | `ORCAROUTER_API_KEY`、mundane/hard の Named Router 実名 |
| Google Places / Routes | BLOCKED | `GOOGLE_MAPS_API_KEY`（Places New と Routes を有効化） |
| 東京発表会場 | BLOCKED | 会場住所は未提供。開発デモの検索中心は**東京駅周辺**（会場そのものではない） |
| LIVE カレンダー/徒歩 UI | 2026-09-20 成功 | 東京→新宿 WALK。`q_long_walk` 後に確定・再読込・カレンダー表示。検証書き込みは `sys/local-verify-20260920` |
| 本番 sys/root 容量 | **未解決・切替前** | 1MB 超過。分割は `2ae90b90`。リハーサルは `rehearse20260920`（`docs/reports/firestore-rehearse-20260920.md`）。本番切替は `docs/plans/firestore-cutover.md`。`sys/root` は削除しない |
| モック通し | 実施済み | `demo:live` PASS。Auth/Firestore は Emulator |
| Cloud Run 公開 | 準備済み・未公開 | 手元 PC の手順は `docs/cloud-run.md` |
| Named Router 名 | 未確認 | ダッシュボードの実際の router 名。`orcarouter/mundane` はプレースホルダ |

モック実行は独立して動作する。LIVE 合格判定には使わない。Cloud Run へは Emulator ではなく本番 Firestore / 匿名 Auth を載せる。
