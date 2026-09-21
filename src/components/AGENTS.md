# 共通 UI

バナー、バッジ、Field、Card など。データ取得は持たない。hooks は `@/client`。

## 共通の見た目

- 決定・保存・次へ: `Button` の既定 variant。横幅いっぱいなら `fullWidth`。
- 補助操作: `Button variant="secondary"`。遷移は `ButtonLink`。
- アイコンだけの操作: `IconButton label="操作名"`。ラベルは必須。
- 色・角丸・高さは `src/app/globals.css` の semantic tokens と `button.module.css` に集約する。
- features の CSS では共通ボタンの色・角丸・高さを上書きせず、余白と配置のみ指定する。
- カレンダーの日付、選択チップ、写真カード、マスコットはそれぞれの専用表現を維持する。操作アイコンは Lucide、文字記号による代用は避ける。

## スマホの入力

- 文字・数値・時刻・選択欄は `text-input.tsx` の `TextInput` / `TextArea` / `SelectInput` を使う。
- モーダルは `ModalSurface` を土台にする。独自の scroll lock や focus 時の強制スクロールを重ねない。
- 設計根拠・適用範囲・実機の確認項目は [mobile-input-ux.md](./mobile-input-ux.md) を参照。
