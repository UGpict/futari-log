# Firestore 保存構造（分割）

最終更新: 2026-09-20

`sys/root` への全データ JSON 格納は **未解決の本番阻害** として残す。アプリの読み書きは分割ドキュメントへ移す。`sys/root` は削除も上書きもしない。

## コレクション

名前空間 `FIRESTORE_NAMESPACE` があるとき、下記のコレクション ID は `{namespace}_` 接頭辞を付ける（検証用。本番データと混ぜない）。

| パス | 内容 |
|---|---|
| `{ns}couples/{coupleId}` | カップルメタ。`ownerUid` `runCountByDate` |
| `{ns}couples/{coupleId}/{ns}sessions/{sessionId}` | セッション。`dateTokyo` `listedOnCalendar` `calendarTitle` `walkLongAck` |
| `.../{ns}runs/{runId}` | 実行。lease / status / eventSeq |
| `.../{ns}events/{eventId}` | 進捗イベント（親へ配列集約しない） |
| `.../{ns}planVersions/{version}` | 行程版（履歴を親へ載せない） |
| `.../{ns}spots/{spotId}` | 地点 |
| `.../{ns}evidence/{evidenceId}` | 根拠 |
| `.../{ns}scenarios/{scenarioId}` | シナリオ |
| `{ns}couples/{coupleId}/{ns}memories/{id}` | 承認済み記憶 |
| `.../{ns}memoryCandidates/{id}` | 記憶候補 |
| `.../{ns}reflections/{id}` | 振り返り |
| `.../{ns}approvals/{id}` | 承認 |
| `.../{ns}replays/{id}` | リプレイ |
| `.../{ns}agentMemories/{agentId}` | エージェント日次キャッシュ |
| `{ns}lookups/{kind}:{id}` | session / run / approval / memory / replay の位置 |
| `{ns}idempotency/{key}` | startRun 冪等 |

カタログ `catalogEvents` / `catalogVenues` / `catalogIngestRuns` は変更しない。

## カレンダー

所有者の `sessions` を `dateTokyo` 範囲で取得する。親ドキュメントへ全セッションを載せない。

## 同時更新

Worker lease、startRun 冪等、承認の一度きりの消費、`basePlanVersion` 照合は Firestore transaction。API と Worker は同じパスを使う。`DATA_BACKEND=firestore` のとき file へフォールバックしない。

## 長距離徒歩の同意

`walkLongAck` は **そのセッション限定**。couple の `agentMemories/travel` にも永続メモリにも書かない。

同意は次を持つ。

- 日付・移動手段・集合 / 解散
- 途中の行程（spot 列）
- 当時の徒歩負担（最長区間・合計分）

再質問するのは、集合・解散が同じでも **負担が増えた** とき。表示文言・item id・写真など、徒歩負担を変えない変更では失効しない（2 分までの取得ゆらぎは負担増とみなさない）。

## travel エージェント記憶の性質

`couples/{id}/agentMemories/travel` はカップル単位の **API 取得キャッシュ** であり、ユーザーの許容・好みではない。

- キー: `travel:{from}:{to}:{mode}:{時刻条件}`
- WALK / DRIVE は東京時間の日付+時。TRANSIT は 5 分バケット。同日だからといって別経路・別出発時刻は使わない
- 値: `{ fetchedAt, payload }`。当日かつ TTL（24h）内だけ再利用
- `leg:` や `walkLongAcknowledged` は書かない。件数は `FACT_CAP`（80）で古い travel キーから落とす

Worker の PENDING 取得は collection group `{ns}runs` の `status` + `createdAt`。定義は `firestore.indexes.json`。本番デプロイは切替前チェック。
