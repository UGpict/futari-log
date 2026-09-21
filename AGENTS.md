<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ふたりログ — 担当境界

バックエンド担当と UI/UX 担当が並行する。契約（`src/contracts`）以外の越境は PR で明示する。

## フロント（触ってよい）

- `src/features/` 画面本体
- `src/components/` 共通 UI
- `src/client/` API クライアントと hooks
- `src/fixtures/` UI 専用 fixture（LIVE に載せない）
- `src/app/**/*.tsx` と `src/app/globals.css` は薄い入口・見た目トークンのみ
- `src/config/public.ts` `src/lib/time.ts`

禁止: `@/server`, `@/worker`, `@/domain`, `@/config/env`, `firebase-admin`, `@/lib/ids`

クライアントでの `firebase`（Client SDK）利用は可。`firebase-admin` は不可。

## バックエンド（触ってよい）

- `src/server/` 認証・Firestore・LLM・外部 API・ジョブ実行
- `src/worker/` 常駐 poller
- `src/app/api/` 認証・入力検証・actions 呼び出し・JSON 応答
- `src/domain/` 内部モデル（画面へ直接 import しない）
- `src/config/env.ts` `src/config/settings.ts` `src/lib/ids.ts`

## 共有契約（両方の確認）

- `src/contracts/` API の入出力、実行状態、進捗イベント、承認、エラー形式
- 変更したら両担当が PR を見る

検証: `npm run check:boundaries` / `npm run ownership`

