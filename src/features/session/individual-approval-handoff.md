# カード単位の変更許可：バックエンド接続メモ

## 実装済みのUI

`session-screen.tsx` の `proposalActions(row)` でカード単位に「この変更を許可」「元のまま」（追加の場合は「追加しない」）を選択できる。

モックでは `/api/fixtures/proposal-decision` をメモリ内の fixture API で処理する。

LIVE では `POST /api/approvals/:id/changes` に接続する。選択のたびに対象カードだけを反映／見送りし、他カードの未決定案は `approval.diff` に残る。リロード後も diff から復元する。全件判断が終わると通常の「このプランで決める」が再表示される。

既存の全件 `/api/approvals/:id/decision` には対象IDを足して送らない（無視されて全件反映される危険がある）。

## 契約

`approvalChangeDecisionRequestSchema`（`src/contracts/session.ts`）

- `decision`: APPROVE | REJECT
- `basePlanVersion`: 画面の現行プラン版
- `change`: discriminated union
  - `replace` — `fromItemId` / `toItemId`
  - `time` — `itemId`（提案側）+ 任意の `fromItemId`
  - `add` — `itemId`
  - `remove` — `itemId`
- `row.key` は画面キーであり API には送らない

応答: `{ ok, approval, planVersion, remaining }`

## サーバ処理

`decideApprovalChange` → `mergePartialPlan`（許可時）→ `validatePlan` → `planHistory` に新版を保存。却下は diff から当該変更だけ削除。
