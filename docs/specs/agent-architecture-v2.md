# Spec: AI エージェント構成 v2

更新: 2026-09-21  
優先: 本仕様が旧仕様（固定振り返り質問・本文文字判定の記憶適用・プラン生成での LLM 最終選定）と矛盾する場合は本仕様を優先する。

## 目標

- プラン作成・場所変更は決定論的処理を維持する。通常プラン生成で LLM 呼び出し 0 回でも正常。
- ユーザー操作中の LLM 待ちを最小化し、AI 利用は主に次の 2 箇所とする。
  - A. 日次のイベント・店舗収集
  - B. デート後の振り返り分析
- 承認済み記憶と更新された候補により、決定論プランが次回改善する。
- 実データ検証・承認・PRIVATE 保護・OrcaRouter 経由は維持する。

## 第1段階: 振り返り保存・分析・承認

### 保存

- 振り返りは Firestore（既存 `couples/{id}/reflections`）へ保存する。
- `sessionId` と `planVersion` に紐付ける。日付だけのキーにしない。
- 同日複数セッションを区別する。
- 予定スポットと実際の訪問（`visits[].visited`）を区別し、未訪問を体験済みにしない。
- 感想・気分（観察）・任意のスポット別評価を保存できる。気分をパートナー感情として自動解釈しない。
- 保存だけでは関係性メモリを有効化しない（候補作成→明示承認が必要）。
- 既存 localStorage 記録は削除・他ユーザー取り込み・同日セッションへの勝手紐付けをしない。

### 非同期分析

- 保存 API は LLM 完了を待たず返す。
- 分析は永続化された `REFLECTION` run（Worker / Workflows）で実行する。
- 冪等キー: `reflectionId` + `contentVersion`（本文版）。
- 編集で `contentVersion` が進んだ場合、旧版の候補・結果を新本文へ適用しない。
- 分析失敗でも保存済み振り返りは残す。
- LLM が選べる処理: 関連確認 / 一問確認 / 記憶候補作成 / 重複矛盾提示 / 終了。固定質問フローにしない。
- 確認待ちは Worker を占有せず `WAITING_INPUT`。回答後に保存状態から再開。
- LLM の承認済み記憶への直接書き込み禁止。

### 根拠の区別

候補・記憶の `sourceType` で区別する:

| sourceType | 意味 |
| --- | --- |
| SELF_REPORT | 自分の感想・希望 |
| PARTNER_STATEMENT_REPORTED | 相手が言ったとユーザーが報告 |
| OBSERVATION | ユーザーの観察（気分スタンプ等） |
| HYPOTHESIS | AI 仮説（記憶化不可） |

計画方針（休憩を挟む等）はユーザー承認後に保存可能。承認は相手の性質が事実確定したことではない。

### 記憶契約

既存 Memory / MemoryCandidate を拡張し、少なくとも次を扱う:

- candidateId / memoryId / subject / content（読みやすい文）
- `planDirectives`（構造化した方針）
- reflectionId / reflectionVersion / evidenceQuote / sourceType
- SOFT / HARD、NEXT_DATE / ONGOING、PRIVATE、active / version / supersedes / approvedAt

承認は ID（`targetCandidateId` / `targetMemoryId` + `expectedVersion`）で行う。`summary.includes` 禁止。

## 第2段階: 決定論プランへの反映

- `runPlanner` / `buildPlan` は決定論のまま。
- `/立|歩/` 等の本文文字判定による記憶適用をやめる。
- 承認済み `planDirectives` を優先順位・滞在・休憩配置・再訪／新規に使う。
- 今回の明示希望と記憶が矛盾する場合は黙殺せず、必要なときだけ確認。
- NEXT_DATE: `targetSessionId == null` は次の有効プランに適用可。セッションが CONFIRMED になった時点でその sessionId に束縛し、放棄 DRAFT には束縛しない。
- `lastSelected` 回避と承認済み再訪／新規希望を区別する。
- 各変更は `memoryInfluences` に memoryId と効果を記録。PRIVATE 根拠文は共有メッセージに出さない。

## 第3段階: 共通カタログ

- `catalogEvents` / `catalogVenues` と既存収集を再利用。
- 明示選択イベントに加え、日付・エリア・希望に合うイベントを通常候補へ自動追加（固定予定にはしない）。
- 明示選択が使えない場合の確認は維持。
- 店舗もカタログ優先、不足時のみ実 API。PRIVATE をカタログ／外部検索へ流さない。
- 事前収集済み ≠ 営業・開催・移動の検証済み。

## 第4段階: 日次収集

- Cloud Run / Worker / Scheduler を優先（Cloud Functions 必須にしない）。
- 東京優先エリアから。日付未指定時に固定 `demoDate` を使い続けない（JST 当日／今週末等）。
- エリア座標を使い、全域で `demoLat/Lng` を使わない。
- カタログ状態を見て調査操作を選ぶ（LLM は曖昧判断のみ）。ID 照合・日付判定はコード。
- Place ID / 公式 URL で同一性。開始日変更だけで増殖させない。再取得失敗で検証済みを無条件削除しない。検索非表示だけでは中止扱いにしない。
- 時間・LLM・外部 API・費用上限、リース、冪等。本番 Scheduler 変更は手動検証後。

## 非目標（今回やらない）

- 本番データ移行、main マージ、本番デプロイ、定時ジョブ有効化（検証提示後に別判断）。
- localStorage ジャーナルの自動マイグレーション。
- ホーム「AIからの提案」カードの動的生成（別依頼）。
