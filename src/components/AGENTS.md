# 共通 UI

バナー、バッジ、Field、Card など。データ取得は持たない。hooks は `@/client`。

## 共通の見た目

- 決定・保存・次へ: `Button` の既定 variant。横幅いっぱいなら `fullWidth`。
- 補助操作: `Button variant="secondary"`。遷移は `ButtonLink`。
- アイコンだけの操作: `IconButton label="操作名"`。ラベルは必須。
- 色・角丸・高さは `src/app/globals.css` の semantic tokens と `button.module.css` に集約する。
- features の CSS では共通ボタンの色・角丸・高さを上書きせず、余白と配置のみ指定する。
- カレンダーの日付、選択チップ、写真カード、マスコットはそれぞれの専用表現を維持する。操作アイコンは Lucide、文字記号による代用は避ける。
