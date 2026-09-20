# イベントカタログ UI 引き渡し

UI は変更していない。契約は `src/contracts/catalog.ts` と `src/contracts/planning.ts`。画面は `@/contracts` と `@/client` だけを使う。

`ENABLE_EVENT_CATALOG` はまだ **false**。一覧・詳細・選択 API はフラグ無しで動く。確定プランへ載せるのはフラグ ON のときだけ。

## 確認状態

| 値 | 意味 |
|---|---|
| `VERIFIED` | 公式ページ本文に値または引用がある |
| `PARTIAL` | URL は取れたが本文一致なし。一覧には出せる |
| `UNKNOWN` | 根拠なし。確定ウィンドウにも確定プランにも使わない |

フィールドは **開催期間 / 日ごとの開催時間 / 休館日 / 会場 / 料金** を分ける。`planEligible` はタイトル＋開催期間がどちらも `VERIFIED` のときだけ true。確定プランへの適用はさらに開催時間・休館日が `VERIFIED` で、その日が開館、滞在が開館時間内であること。

選択したイベントが使えないとき、施設候補へ黙って置き換えない。run は `WAITING_INPUT`、`waitingQuestion.id = q_event_fallback`。選択肢は「施設の候補で続ける」「中断する」。

## 写真

**取得・表示確認は未実施。** `photos.displayVerified` は常に `false`。`photoName` は保存しない。event は公式 `og:image`（今回の実データは `null`）。venue は Places の帰属表示のみ。画面での写真表示確認も未実施。

## 費用（契約）

`cost.llmUsd` は USD の小数のまま。`cost.llmJpy` は換算できるとき小数で集計する（1円未満を 0 や null にしない）。換算できないときだけ null（画面は「換算不能」）。1円未満の表示は「¥1未満」。`unaccountedCalls` は USD が欠測の課金呼び出し回数。

## API

認証付き。

- `GET /api/catalog/events?date=&genre=&area=`
- `GET /api/catalog/events/:id`
- `GET /api/catalog/venues/:id`
- `POST /api/sessions/:id/selected-events` body `{ "eventIds": ["evt_…"] }`（最大 4）

## 実レスポンス例（2026-09-20 取得、DATA_BACKEND=file）

一覧:

```json
{
  "events": [
    {
      "id": "evt_ad53ab81c271fbc6",
      "title": "水滸伝",
      "genre": "展覧会",
      "venueId": "ven_73a43cf0461d5104",
      "venueName": "Tokyo Station Gallery",
      "dateStart": "2026-09-19",
      "dateEnd": "2026-11-08",
      "confirmation": "VERIFIED",
      "sourceUrl": "https://www.ejrcf.or.jp/gallery/exhibition/202609_suikoden.html",
      "fetchedAt": "2026-09-20T07:37:22.852Z",
      "planEligible": true
    }
  ],
  "fetchedAt": "2026-09-20T07:37:22.852Z"
}
```

詳細の要点（契約どおり `fields` + `photos`）:

```json
{
  "id": "evt_ad53ab81c271fbc6",
  "title": "水滸伝",
  "confirmation": "VERIFIED",
  "planEligible": true,
  "sourceUrl": "https://www.ejrcf.or.jp/gallery/exhibition/202609_suikoden.html",
  "officialUrl": "https://www.ejrcf.or.jp/gallery/exhibition/202609_suikoden.html",
  "fetchedAt": "2026-09-20T07:37:22.852Z",
  "timeStart": "10:00",
  "timeEnd": "18:00",
  "fridayClose": "20:00",
  "closedDaysText": "月曜日［ただし9/21、10/12、11/2は開館］、10/13 (火)",
  "feeText": "一般（当日）1,600円 高校・大学生（当日）1,100円 …",
  "eventImage": null,
  "photos": {
    "event": null,
    "venue": {
      "kind": "VENUE",
      "sourceUrl": null,
      "attribution": "Google",
      "confirmation": "PARTIAL"
    },
    "displayVerified": false,
    "note": "写真の取得・表示確認は未実施。photoName は保存しない。event は公式 og:image、venue は Places 帰属のみ。"
  }
}
```

各 `fields.*.confirmation` / `sourceUrl` / `quote` / `fetchedAt` は詳細に含む。タイトル・期間・時間・休館・会場・料金はいずれも公式ページ本文と一致した `VERIFIED`。

選択:

```json
{ "sessionId": "ses_…", "selectedEventIds": ["evt_ad53ab81c271fbc6"] }
```

使えないときの質問:

```json
{
  "id": "q_event_fallback",
  "prompt": "選択したイベントを確定プランに使えません（カタログに無い）。施設の候補で続けますか？黙って置き換えはしません。",
  "options": ["施設の候補で続ける", "中断する"]
}
```
