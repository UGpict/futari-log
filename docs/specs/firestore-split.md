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

`walkLongAck` は対象セッションの行程指紋（日付・移動手段・集合/解散・spot 列・最長/合計徒歩分）にだけ有効。「今回続ける」は couple の travel 記憶にも永続メモリにも書かない。行程が変われば再質問する。

## travel エージェント記憶の性質

`couples/{id}/agentMemories/travel` は **永続メモリ**（カップル単位）。`travel:*` の事実は日付が同じなら使い回す日次キャッシュで、実行（run）内だけの一時状態ではない。`daily` も scout の日次スナップショットとして残す。

「今回続ける」の徒歩同意はここへ書かない。今後のデートにも使う内容は、対象・適用範囲を示して `MEMORY_SAVE` 承認を別途取る。
