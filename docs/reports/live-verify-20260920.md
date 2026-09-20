# LIVE 実環境確認（2026-09-20）

判定: **成功**（アプリ経路）。本番 `sys/root` の 1MB 超過は **未解決**。

## 成功したこと

- health: LIVE / firebase / firestore
- セッション作成: 正しい JSON は 201。不正 JSON は 400 `invalid json`（スキーマ緩和なし）
- UI `ses_ace2d37f485dfb10` 東京駅→新宿駅 WALK カフェ: `q_long_walk`（103/108 分）→「このまま徒歩で続ける」→ CONFIRMED（Beck's Coffee / Burdigala Tokyo / Curly's Croissant）
- 同じ session id で再読込、カレンダー 9/20 「予定1件」
- API 双子 `ses_a2493bd0e2d4826b`
- 既存行程の Routes 再計算: WALK 2/1/2/103 +5 buffer。DRIVE は未来出発で 16 分（未調整）

検証用書き込みは `FIRESTORE_ROOT_DOC=sys/local-verify-20260920`。本番データへは混ぜていない。

## 分割保存の再確認（同日）

`FIRESTORE_NAMESPACE=localverify20260920`（本番 `couples` には書いていない）。`sys/root` は削除していない。

- `ses_f7a2edfb2aca3978` / `run_b871f2b1d55bf99a`: `q_long_walk`（106/110 分）→「このまま徒歩で続ける」→ CONFIRMED（Beck's Coffee / Burdigala Tokyo / DEAN & DELUCA Market Store Yaesu）
- 再読込後カレンダー 9/20 に当該セッション 1 件
- 他ユーザー 403
- カップル文書キーはメタのみ。イベント 46 件・行程 1 件はサブコレクション。2 件目セッション `ses_f7c9eb3536f71962` を親へ集約していない


## 未解決

本番 `sys/root` への書き込みは `INVALID_ARGUMENT: payload longer than 1048487 bytes`。単一ドキュメントへ全カップル・全履歴を載せているため。分割保存へ移行する（この変更）。本番 `sys/root` は削除しない。
