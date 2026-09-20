# Firestore 分割リハーサル（2026-09-20）

本番 `couples` へは書いていない。`sys/root` は削除も上書きもしていない。本番切替は未実施。

ソース: 実 `sys/root`。書き込み先: `FIRESTORE_NAMESPACE=rehearse20260920`（`rehearse20260920_couples` 等）。LIVE 検証の `localverify20260920` とは別。

## dry-run（読み取りのみ）

`npx tsx scripts/migrate-firestore-split.ts --dry-run --source=sys/root`

| 項目 | 件数 |
|---|---|
| couples | 8 |
| sessions | 21 |
| runs | 21 |
| events | 589 |
| planVersions | 16 |
| approvals | 1 |
| lookups | 43 |
| relationshipErrors | なし |
| 論理パス（spots 等を除く） | 718 |

`--apply` に `--namespace` が無い場合は拒否する（`.env.local` の namespace では代替しない）。

## 検証 namespace への適用

1. `--apply --namespace=rehearse20260920` → `written: 2038` `skipped: 0`
   - 2038 は spots / evidence / scenarios / agentMemories / idempotency を含む実書き込み。718 はそれらを除いた照合用パス。
2. `--compare --namespace=rehearse20260920` → couples/sessions/runs の sourceOnly・destOnly は空。events 589・planVersions 16 が一致。
3. `--apply --namespace=rehearse20260920 --if-missing` → `written: 0` `skipped: 2038`。重複ドキュメントは増えていない。既存は上書きしていない。

サンプルパスは `rehearse20260920_couples/...` / `rehearse20260920_lookups/...`。接頭辞なしの `couples` には出ていない。

## インデックス

`firestore.indexes.json` に Worker が使う collection group がある。

- 本番切替後: `runs`（`status` + `createdAt`）
- 検証: `localverify20260920_runs` / `rehearse20260920_runs`

クエリは `expireAndClaimPending` の PENDING + `orderBy("createdAt")`。インデックス未作成時は orderBy なしへ落ちる。`firebase deploy --only firestore:indexes` は切替当日まで未実施。
