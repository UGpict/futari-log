# plan: Firestore 分割への本番切替

本番移行・切替はまだ実施しない。このファイルは手順の正。チェックは切替当日に付ける。

前提: 分割保存は commit `2ae90b90b2bae8d7477fc66d696d1f4b3226f814`。検証書き込みは `FIRESTORE_NAMESPACE` 付きコレクションのみ。`sys/root` は削除しない。

## 切替前に完了していること

- [x] 分割ドキュメントの読み書き（file / Firestore）
- [x] LIVE 検証 namespace `localverify20260920` で作成・徒歩同意・確定・カレンダー・403
- [x] `sys/root` の dry-run と検証用 namespace `rehearse20260920` へのリハーサル（本番 `couples` へは書かない）。記録: `docs/reports/firestore-rehearse-20260920.md`
- [x] 徒歩同意を経路と負担に紐付け、負担増だけ再質問
- [x] travel キャッシュを経路・手段・時刻・取得時刻・TTL で切る
- [ ] `firestore.indexes.json` を本番プロジェクトへデプロイ（`runs` の collection group）
- [ ] 切替直前の Firestore export（PITR または `gcloud firestore export`）

## 切替当日の順序

いま `--apply` / `--compare` は `--namespace` 必須。切替当日に限り、そのガードを外した適用だけを使う。`.env.local` の `FIRESTORE_NAMESPACE` では代替しない。

### 1. 旧 API・Worker の書き込み停止

対象は **空の `FIRESTORE_NAMESPACE` で `sys/root` に書いている** プロセス。検証用 `localverify20260920` / `rehearse20260920` は本番切替の停止対象ではない。

- **手元 LIVE（現時点の実書き込み）**: その Next と worker を止める。進行中 RUN は `RUNNING` のまま残してよい。lease 切れは INTERRUPTED。新規 `startRun` は受けない。
- **Cloud Run を公開済みなら**: サービス `futari-log`（`asia-northeast1`）の現行リビジョンへトラフィック 0、または min instances 0。health 以外を 503 にする改訂でもよい。Worker は同一コンテナなので API と一緒に止まる。
- 停止後に `sys/root` を再取得し、payload バイト数と `updateTime` を記録する。これが最終ソース。停止後にサイズが増えていたら、まだ書き込みが残っている。

### 2. 最終移行・照合

書き込み先は **namespace なしの分割コレクション**（`couples` / `sessions` / `runs` …）。検証 prefix は付けない。`sys/root` は上書きも削除もしない。

```bash
DATA_BACKEND=firestore npx tsx scripts/migrate-firestore-split.ts --dry-run --source=sys/root
# 件数・relationshipErrors 空を確認。リハーサルは couples 8 / sessions 21 / runs 21 / events 589。
# 切替当日の件数は停止後の sys/root を正とする。

# ガード解除後（切替当日のみ）:
DATA_BACKEND=firestore npx tsx scripts/migrate-firestore-split.ts --apply --source=sys/root
DATA_BACKEND=firestore npx tsx scripts/migrate-firestore-split.ts --compare --source=sys/root
```

- couple / session / run ID の sourceOnly が空であること。
- destOnly は空、または切替前からある分割ドキュメントとして説明できること。
- 中断したら `--apply --if-missing` で再開する。既存 ID はスキップし、未作成だけ書く。通常の `--apply`（set）を再実行すると同じ ID を上書きするので、再開は `--if-missing` に限る。
- 再実行でドキュメント数が倍になっていないこと。

### 3. 同じ保存構造を使う API・Worker への切替

新リビジョン / 新プロセス:

- `DATA_BACKEND=firestore`
- `FIRESTORE_NAMESPACE` 空（検証 prefix を本番 URL に載せない）
- `FIRESTORE_ROOT_DOC` は参照用に残してよい。アプリの読み書きは分割ストアのみ
- file フォールバックは使わない
- Worker は collection group `runs`（`status` + `createdAt`）を同じプロジェクトで見る。切替前に indexes をデプロイ済みであること

旧リビジョンは起動しない。検証 namespace のプロセスを本番ポートに載せない。

### 4. 新規作成・再表示の確認

- 匿名でカップル＋セッション作成が 201。新規 ID が `couples/{id}` 配下に付く（`sys/root` の payload は増えない）
- 移行済みセッションの再表示（`planVersions` / `spots`）
- カレンダーが一覧を `dateTokyo` で返す
- 他ユーザー 403
- 新規 run のイベントが session 配下に増え、couple 親が膨張しない

## 切替後の復旧（新規データを失わない）

切替後に作られたセッション・run・承認は **分割コレクションにしか無い**。`sys/root` へアプリを戻すと、移行スナップショット以降の新規が画面から消える。blob へ載せ直す復旧は使わない。

1. **正本は分割コレクションの PITR / export。** 切替直後と、その後の通常運用で `gcloud firestore export` する。collection ID は `couples` `sessions` `runs` `events` `planVersions` `spots` `evidence` `scenarios` `memories` `memoryCandidates` `reflections` `approvals` `replays` `agentMemories` `lookups` `idempotency`。
2. 障害時は API・Worker を止め、PITR または直近 export を **同じ分割パス** へ戻す。戻したあとに同じ分割ストアを読むリビジョンを再起動する。
3. 切替後に新規が乗った状態で移行をやり直すな。`sys/root` 再適用は新規 ID を消すか上書きする。欠損の埋めは `--if-missing` のみ（既存を触らない）。
4. `sys/root` は最終移行スナップショットとして残すだけ。アプリの読み書き先にはしない。
5. 部分欠損は `lookups`（`session:` / `run:`）と親 session から欠けた子を特定し、export からそのパスだけ戻す。

切替前に失敗しただけなら、検証 prefix のリハーサルデータを本番パスへコピーしない。書き込み停止を確認してから、当日の `sys/root` でやり直す。

## 使わないこと

- 本番 `couples` と検証 namespace の混在
- 切替前に `sys/root` を削除する
- file ストアへのフォールバック
- 検証用 `localverify20260920` / `rehearse20260920` を本番 URL に載せる
- 切替後の新規を捨てて `sys/root` だけに戻す
