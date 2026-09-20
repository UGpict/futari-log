# 行程の店舗写真（Places）

採用された行程カードに、その店舗の Place ID 由来の写真を出す。イベント告知画像は対象外。

## 現状

カード画像はカテゴリの参考写真（`/images/itinerary/{cafe,museum,nature}.jpg`）で、店名から選んでいる。LIVE でも同じファイルになる。`photos.displayVerified` は常に `false`。`photoName` は保存しない。

## 契約

`GET /api/places/photos?ids=placeId,...`（認証付き、最大 8）

各要素:

| フィールド | 内容 |
|---|---|
| `placeId` | 問い合わせた ID。店名の再検索はしない |
| `state` | `ready` / `none` / `failed` |
| `kind` | 常に `VENUE`。EVENT にはしない |
| `source` | `places` |
| `imageUrl` | 自前プロキシ。Google の photo name や API キーは出さない |
| `googleMapsUri` | 写真または店舗の Maps URI |
| `authorAttributions` | `displayName` / `uri` / `photoUri`（無ければ空） |

`GET /api/places/photos/media?placeId=` はバイト列。キーはサーバーだけ。

## 取得

- Place Details の `photos` を **その Place ID** で取る。店名検索しない。
- 先頭 1 枚を Place Photos で取る。
- photo name は Firestore・ファイル・Next.js 画像最適化キャッシュに置かない。media のたびに Details から取り直す。
- name 期限切れは同じリクエスト内で Details 再取得を **1 回**。連続失敗は `failed`。プラン生成は止めない。
- 応答 `Cache-Control: no-store`。`<img>` を使い `next/image` の `/_next/image` は使わない（Places コンテンツの永続キャッシュになる）。
- MOCK（`mock:`）は Google を呼ばず、従来の参考写真のまま。

## 画面

- 採用行程の Place ID だけ遅延読み込み。セッションの 1.2s ポーリングでは写真 API を再実行しない。
- 読み込み中は同じ画像枠のスケルトン。`none` / `failed` は枠を残し、店名・カテゴリ。LIVE で参考写真へ置換しない。
- 投稿者がいれば写真に対応させて出す。Places 写真を「公式写真」と呼ばない。Google Maps の帰属と `googleMapsUri` への導線を付ける。
- 再提案で `spotId` が変わったら古い店の画像は出さない。

## やらない

- `photos.displayVerified` を true にする
- 会場写真をイベント写真として出す
- 写真失敗でプラン確定を止める
