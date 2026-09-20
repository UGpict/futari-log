# カレンダーと場所選択（マイルストーン1）

出発点は `docs/backend-handoff.md` の 1 と 6、および LIVE 固定候補の排除。
バックエンド実装は `integrate/main-ui-catalog`（カタログ品質 `2114c55` + UI `8a54ec2`）。

## 完了条件

実際の場所（MOCK ならカタログ候補、LIVE なら Places の候補）を選んでプランを作り、確定し、再読込後にカレンダーから開ける。

## 契約

### カレンダー `GET /api/couples/:id/sessions?from=&to=`

- 返す: `sessionId`, `date`, `startTime`, `endTime`, `status`, `title`
- 載せる: `CONFIRMED` / `IN_PROGRESS` / `DONE` / `REFLECTED`、および行程がある `DRAFT`
- 載せない: 行程のない下書き。黙ってデモ予定は足さない
- 空: `{ "plans": [], "from": "...", "to": "...", "state": "empty" }`

### 場所 `GET /api/places/search?q=&lat=&lng=`

- 返す: `id`（Place ID または MOCK の `mock:`）, `name`, `lat`, `lng`, `address`
- `state`: `ok` / `empty` / `failed`
- 名前と座標と ID は同一候補のもの。デモ座標へ置き換えない
- LIVE で `mock:` をセッション入力に載せたら 400

### 確定 `POST /api/sessions/:id/progress` `{ confirm: true, status: "CONFIRMED" }`

- 行程なし、または `validation.state === "FAIL"` は 409。画面の disabled だけに依存しない

## LIVE 生成

実候補で再検索 → 再検証 → 無理なら `WAITING_INPUT`（確定プランにしない）。
MOCK カタログ ID を LIVE の選定・固定予定解決に使わない。

## 希望カテゴリ

画面の 14 種別（食事・スイーツ・カフェ・アート・散策・買い物・映画・水族館・遊び・スポーツ・温泉・バー・街・立ち寄り）が基準。対応表は `docs/specs/spot-kinds.md`。
Places の `includedTypes` に載せる。ものづくり体験は確認質問。検証条件は緩めない。

## まだやらない

振り返り Firestore、記憶承認の ID 修正、構造化 REPLAN、ホームおすすめ、イベント選択 UI。店舗写真は `docs/specs/place-photos.md`。
