# App Router

- `*.tsx`（page/layout）: 画面を組み立てる薄い入口。features を呼ぶだけ。
- `api/**`: バックエンド入口。認証 → 契約で検証 → `server/api/actions` → JSON。
