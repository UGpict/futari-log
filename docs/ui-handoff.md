# UI 担当向け引き渡し

バックエンド（API / worker / Firestore）は別担当。画面は契約と fixture だけで進められる。

## 起動（fixture、サーバー不要）

```bash
cp .env.example .env.local   # 秘密は不要
npm install
npm run dev:ui
```

http://localhost:3000

`NEXT_PUBLIC_USE_API_FIXTURES=true` のとき API は実サーバーを呼ばず、契約と同じ JSON を返す。
`NEXT_PUBLIC_APP_RUNTIME=LIVE` または本番では fixture は無効。Cloud Run にこの変数を載せない。

## 確認用 URL（fixture 時）

| URL | 状態 |
|---|---|
| `/` | 入力（成功時は `/sessions/fx-success` へ） |
| `/sessions/fx-loading` | 読込中のまま |
| `/sessions/fx-success` | 行程成功（CONDITIONAL） |
| `/sessions/fx-failed` | 検証 FAIL |
| `/sessions/fx-approval` | 承認待ち + 再計画差分 |
| `/sessions/fx-replan` | 自動適用イベント |
| `/sessions/fx-error` | 失敗メッセージ |
| `/memory?couple=cpl_fixture` | 記憶一覧 |
| `/replay/rep_fx` | REPLAY |

実 API で通すときは `npm run dev`（Emulator + worker）。fixture フラグは外す。

## 触ってよいパス

- `src/features/` 画面
- `src/components/` 共通 UI
- `src/client/` fetch と hooks
- `src/fixtures/` 上記状態の JSON
- `src/app/**/*.tsx` は薄い入口のまま

禁止: `src/server`, `src/worker`, `src/domain`, `src/config/env.ts`, `src/app/api`

## API の使い方

画面は `@/client` の `api()` / `ensureAuth()` / hooks だけを使う。型は `@/contracts`。
契約を変える PR はバックエンド担当の確認が必要。

```ts
import { api, ensureAuth } from "@/client";
import type { SessionSnapshot } from "@/contracts";

const me = await ensureAuth();
const snap = await api<SessionSnapshot>(`/api/sessions/${id}`);
```

イベントカタログの契約・実レスポンス・確認状態は `docs/catalog-ui.md`。UI コードはまだ触らない。
フロントからバックエンドへの実装依頼（カレンダー一覧・振り返りスタンプ・メモ・提案）は `docs/backend-handoff.md`。契約未確定の項目は API を先に切らない。
