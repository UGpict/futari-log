# カード単位の変更許可：バックエンド接続メモ

## 実装済みのUI

`session-screen.tsx` の `proposalActions(row)` でカード単位に「この変更を許可」「元のまま」（追加の場合は「追加しない」）を選択できる。

モックでは `/api/fixtures/proposal-decision` をメモリ内の fixture API で処理する。

LIVE では `POST /api/approvals/:id/changes` に接続する。選択のたびに対象カードだけを反映／見送りし、他カードの未決定案は `approval.diff` に残る。リロード後も diff から復元する。全件判断が終わると通常の「このプランで決める」が再表示される。

既存の全件 `/api/approvals/:id/decision` には対象IDを足して送らない（無視されて全件反映される危険がある）。

## 「すでに判断済み」になる条件

API は `approval.diff` に **まだ残っている変更** だけ受理する。次だと 409 になる。

1. そのカードをすでに許可／却下して diff から消えたあと、もう一度送った
2. 画面の見た目だけ時刻が違うが、`diff.timeShifts` / `replaced` に無い（操作ボタンは出さない）
3. `basePlanVersion` が現行プランとずれた（先に別カードを反映したあと古い版のまま送った）
4. approval 自体が CONSUMED / REJECTED

対策: `proposalRows` は `apiChange`（diff 由来）があるカードだけボタンを出す。サーバは `resolveChangeInDiff` で kind のズレを吸収する。

## 契約

`approvalChangeDecisionRequestSchema`（`src/contracts/session.ts`）

- `decision`: APPROVE | REJECT
- `basePlanVersion`: 画面の現行プラン版
- `change`: discriminated union（`row.apiChange` をそのまま送る）
- `row.key` は画面キーであり API には送らない

応答: `{ ok, approval, planVersion, remaining }`

## サーバ処理

`decideApprovalChange` → `resolveChangeInDiff` → `mergePartialPlan`（許可時）→ `validatePlan` → `planHistory` に新版を保存。却下は diff から当該変更だけ削除。
