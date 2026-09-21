# 検証メモ: agent-architecture-v2（2026-09-21）

## 単体（MOCK / ローカル）

| 項目 | 結果 |
| --- | --- |
| `tsc --noEmit` | OK |
| `tests/memory-directives.test.ts` | OK（directive 有無で滞在差、WALK_HARD_CAP、仮説拒否、NEXT_DATE 束縛） |
| `tests/privacy.test.ts` | OK |
| `tests/plan.test.ts` | OK |

## 実LLM / 実API / 画面

| 項目 | 状態 |
| --- | --- |
| LIVE 振り返り保存→分析 | **第2回: 分析 SUCCEEDED**（第1回は schema 失敗。下記 LIVE検証） |
| OrcaRouter 経由の reflect | 第2回: `gpt-4o-mini-2024-07-18` / `CREATE_CANDIDATES` / ok |
| ホーム振り返り UI | 同日1セッション時に API 保存。複数・0件は localStorage のみ。旧 local は削除しない |
| 本番 Scheduler | 変更・有効化なし |

## LIVE検証

### 第1回（2026-09-21・途中失敗で停止）

| 項目 | 値 |
| --- | --- |
| revision | `futari-log-00020-qz9` |
| commit | `f0ae67e`（`177f205` + DEMO_DATE 除去） |
| URL | https://futari-log-w5a2hgpkiq-an.a.run.app |
| `ENABLE_EVENT_CATALOG` | `false` |
| couple / session | `cpl_9b31d148195cf4a9` / `ses_5d67809bbe2f12a0` |
| INITIAL_PLAN run | `run_08c0143f92735dd6` → **SUCCEEDED** |
| REFLECTION run | `run_09330aea58f51c41` → **FAILED**（`schema validation failed`） |
| 到達点 | セッション作成 → 初回プラン表示 → reflections POST → REFLECTION enqueue → LLM 呼出 → **失敗** |
| 未到達 | WAITING_INPUT（分析質問） / MEMORY 承認 / USER_CONFIRMED / NEXT_DATE 束縛 |

リトライなし。コード修正なし。生ログ: `docs/reports/live-e2e-architecture-v2-raw.json`（第1回時点）。

#### 初回プラン表示 vs REFLECTION（対比）

| 区間 | 開始 (UTC) | 終了 (UTC) | 所要 |
| --- | --- | --- | --- |
| **初回プラン表示まで**（run `createdAt`→`finishedAt`） | 2026-09-21T02:22:52.610Z | 2026-09-21T02:23:58.758Z | **66,148 ms** |
| 同上（イベント `RUN_STARTED`→`RUN_FINISHED`） | 02:22:53.892Z | 02:23:59.331Z | **65,439 ms** |
| 同上（クライアント POST→terminal） | 02:22:51.941Z | 02:24:00.070Z | **68,129 ms** |
| **REFLECTION enqueue→完了（失敗）**（run `createdAt`→`finishedAt`） | 02:24:02.486Z | 02:24:06.949Z | **4,463 ms** |
| 同上（イベント MODEL_SELECTED `latencyMs`） | — | — | LLM 壁時計 **2,651 ms**（`ok:false`） |

→ 初回プラン待ち ≈ **66 s**（主因: 同期 Gemini grounding ≈51.7 s）。REFLECTION は ≈ **4.5 s** で schema 失敗。

#### 失敗箇所（修正せず停止）

- **現象**: REFLECTION `status=FAILED` / `error=schema validation failed`。approvals 0 件。
- 以降の承認・NEXT_DATE 束縛は未実施。

---

### 第2回（2026-09-21・NEXT_DATE 束縛失敗で停止）

| 項目 | 値 |
| --- | --- |
| revision | `futari-log-00022-vn9`（traffic 100%） |
| commit | `6d5ef79` |
| image tag | `app:6d5ef79`（digest `sha256:a6870ec7…`） |
| URL | https://futari-log-w5a2hgpkiq-an.a.run.app |
| `ENABLE_EVENT_CATALOG` | `false` |
| couple / session | `cpl_12021f0e14f50f62` / `ses_6fb5e8716a56cad4` |
| next session | `ses_677a1d38f2c062b1`（DRAFT・未束縛） |
| INITIAL_PLAN run | `run_a0a8015bcb9a5774` → **SUCCEEDED** |
| REFLECTION run | `run_8ab2f617a35f395b` → **SUCCEEDED**（`CREATE_CANDIDATES`） |
| 到達点 | セッション作成 → 初回プラン → reflections POST → REFLECTION 成功 → MEMORY 承認（1件）→ next session 作成 |
| 未到達 / 失敗 | **WAITING_INPUT なし**（質問なしで候補作成）／**NEXT_DATE 束縛なし**（承認メモリが ONGOING のみ） |
| リトライ | **なし**（指示どおり停止） |
| 生ログ | `docs/reports/live-e2e-architecture-v2-raw.json`（第2回で上書き） |

#### 第1回との差分（要点）

| 指標 | 第1回 | 第2回 | 差分 |
| --- | --- | --- | --- |
| 初回プラン `createdAt`→`finishedAt` | **66,148 ms** | **17,854 ms** | **−48,294 ms**（約 73% 短縮） |
| 初回プラン経路の LLM | grounding 同期あり（≈51.7 s） | **LLM なし**（`deterministic/planner` のみ） | grounding 除去が効いた |
| REFLECTION | schema **FAILED**（4,463 ms） | **SUCCEEDED**（4,137 ms） | 出力契約・観測・repair 後の改善 |
| repair | （失敗、詳細ログ不足） | **未発動**（1回目で ok） | — |
| MEMORY 承認 | 未到達 | ONGOING 1件 `USER_CONFIRMED` | — |
| NEXT_DATE 束縛 | 未到達 | **失敗**（束縛対象の NEXT_DATE メモリ無し） | 停止理由 |

#### 初回プラン表示（Firestore）

| 区間 | 開始 (UTC) | 終了 (UTC) | 所要 |
| --- | --- | --- | --- |
| run `createdAt`→`finishedAt` | 2026-09-21T04:54:20.049Z | 2026-09-21T04:54:37.903Z | **17,854 ms** |
| イベント `RUN_STARTED`→`RUN_FINISHED` | 04:54:21.538Z | 04:54:38.352Z | **16,814 ms** |
| クライアント POST→terminal | 04:54:20.226Z | 04:54:39.415Z | **19,189 ms** |

#### 初回プラン経路の LLM

| イベント | モデル | tokens | cost | ok |
| --- | --- | --- | --- | --- |
| `MODEL_SELECTED`（唯一） | `deterministic/planner` | 0 / 0 | 0 | true |

`gemini-grounding` / `chat/completions` / `MODEL_SELECTED`（実モデル）は初回プラン run events に **0 件**。

#### attachSpotImages

| 項目 | 値 |
| --- | --- |
| 代理区間 | travel `TOOL_COMPLETED` 04:54:34.492Z の後、画像 HTTP 群 → 完了イベント 04:54:36.889Z |
| 所要（places-photo 再開〜完了イベント） | 04:54:35.352Z → 04:54:36.889Z ≈ **1,537 ms** |
| 完了イベント文言 | 「Places。未取得はプレースホルダ。Gemini grounding は同期では呼ばない」 |
| プラン掲載スポット（3） | **写真あり 3**（いずれも `imageProvider=places`）／**プレースホルダ 0** |

#### REFLECTION

| 区間 | 開始 | 終了 | 所要 |
| --- | --- | --- | --- |
| run `createdAt`→`finishedAt` | 04:54:41.078Z | 04:54:45.215Z | **4,137 ms** |
| `MODEL_SELECTED` latencyMs | — | — | **2,233 ms**（ok:true） |

- action: `CREATE_CANDIDATES`（WAITING_INPUT なし）
- repair: **未発動**（単回成功。`llm_parse_failure` NOTICE / 構造化ログなし）
- run.cost: `mundaneCalls=1`, `llmJpy=0.043362`

#### LLM 呼び出し一覧（第2回）

| フェーズ | モデル | prompt | completion | costUsd | costJpy | latencyMs | ok |
| --- | --- | --- | --- | --- | --- | --- | --- |
| INITIAL_PLAN 選定 | `deterministic/planner` | 0 | 0 | 0 | 0 | 0 | true |
| REFLECTION | `gpt-4o-mini-2024-07-18` | 983 | 242 | 0.000292 | 0.043362 | 2233 | true |

#### 失敗箇所（リトライせず停止）

- **現象**: 承認後メモリは `scope=ONGOING` / `甘いものが好き` / `planDirectives=[]` のみ。NEXT_DATE 候補が無いため next session への束縛 0 件。
- **承認**: `MEMORY_SAVE` が 2 件 PENDING → スクリプトは先頭 1 件のみ APPROVE。もう 1 件は PENDING のまま。
- **WAITING_INPUT**: REFLECTION が質問せず `CREATE_CANDIDATES` で完了したためスキップ。
- **補足（第3回で判明）**: 第2回 REFLECTION の未承認 PENDING に `NEXT_DATE` + `PREFER_SEATED_REST` 候補（`mc_f4b42bd3567b4d67`）が残っていた。第2回スクリプトは別候補（ONGOING）を先に承認したため束縛検証に使われなかった。

---

### 第3回（2026-09-21・NEXT_DATE 束縛 + directive 効果）

| 項目 | 値 |
| --- | --- |
| revision | `futari-log-00022-vn9`（再デプロイなし） |
| commit（稼働） | `6d5ef79` |
| couple | `cpl_12021f0e14f50f62`（**isDemo=true**、第2回計測スクリプト作成。`createdAt=2026-09-21T04:54:18.256Z`、raw `coupleId` 一致） |
| 振り返り投稿先 | `ses_6fb5e8716a56cad4`（第2回プラン session） |
| 文面 | 「次のデートだけ、長く立つのがつらいので座れる休憩を多めにしたい」 |
| REFLECTION | `run_a6b27aba9022bb19` → **SUCCEEDED** |
| 承認 | `appr_ee626391e9b64e7b` / candidate `mc_069e72e71365e36d` |
| 新セッション | `ses_20c6113af0f1ffbf` |
| INITIAL_PLAN | `run_4652a646b7ba0cbb` → **SUCCEEDED**（≈17.9 s） |
| リトライ | なし |

#### 条件1: 認証

- カスタムトークン発行（IAM `signJwt`）は org/IAM により拒否された。
- 実行時はカップル `ownerUid` を一時 UID（prefix `OYgPNvTu`）へ差し替え、API 実行後に元の ownerUid（prefix `dh33Ruhi`）へ復元した。
- SA 鍵ファイルは作成していない。一時スクリプト／トークンはリポジトリに未コミット。
- **次回以降**: 計測スクリプトが第 N 回の認証情報を保持し、同一所有者で継続できるようにする。

#### 所有者の整合性確認（読み取りのみ・修正なし）

対象: 差し替え期間（`2026-09-21T05:19Z`–`05:25Z`）に作成・更新されたドキュメント、および第3回既知 ID。カップル復元後 ownerUid（prefix `dh33Ruhi`）との一致を確認。列挙 158 件。

| 結果 | 件数 |
| --- | --- |
| couple 復元済み | 1（`cpl_12021f0e14f50f62` ownerUid=dh33Ruhi…） |
| ownerUid/uid 一致 | 1（`ses_6fb5e8716a56cad4`） |
| 当該フィールドなし | 151（events / spots / memories / reflections / approvals 等） |
| **不一致** | **5** |

**不一致（修正せず停止）**:

| ドキュメント | フィールド | 現在の値（prefix） | 期待（復元後） |
| --- | --- | --- | --- |
| `sessions/ses_20c6113af0f1ffbf` | `ownerUid` | `OYgPNvTu`… | `dh33Ruhi`… |
| `runs/run_4652a646b7ba0cbb`（上記 session 配下） | `ownerUid` | `OYgPNvTu`… | `dh33Ruhi`… |
| `runs/run_a6b27aba9022bb19`（`ses_6fb5e8716a56cad4` 配下） | `ownerUid` | `OYgPNvTu`… | `dh33Ruhi`… |
| `idempotency/arch-v2-r3-ses_20c6113af0f1ffbf` | `uid` | `OYgPNvTu`… | `dh33Ruhi`… |
| `idempotency/reflect:ref_6c0307f24db4badb:v1` | `uid` | `OYgPNvTu`… | `dh33Ruhi`… |

#### REFLECTION 出力

| 項目 | 値 |
| --- | --- |
| action | `CREATE_CANDIDATES` |
| model | `gpt-4o-mini-2024-07-18`（prompt 1033 / completion 180 / $0.000262 / 1834 ms） |
| candidate | `mc_069e72e71365e36d` |
| scope | **NEXT_DATE** |
| type | CARE |
| strength | SOFT |
| planDirectives | **`PREFER_SEATED_REST`**（categories/spot/maxStay/walkCap は null） |

→ 期待どおりのため停止せず続行。

#### NEXT_DATE 束縛

| 記憶 | targetSessionId |
| --- | --- |
| `mem_069e72e71365e36d`（承認後） | **`ses_20c6113af0f1ffbf`**（新セッション作成時に束縛） |

#### 第3回 INITIAL_PLAN（LIVE）

| spot | 名称（Firestore） | 滞在 | standing / rest | memoryIds |
| --- | --- | --- | --- | --- |
| `ChIJ6UVSHl2JGGARDurMrMPwvdk` | ART AQUARIUM MUSEUM | **35** | HIGH / LIMITED | `mem_069e72e71365e36d` |
| `ChIJ484bdgCLGGARczIjpHFH_-Y` | KITTE テラス | 50 | null / null | （なし） |
| `ChIJZc0V9vuLGGAR33NDBc1Sl6w` | DEAN & DELUCA Market Store Yaesu | 50 | LOW / EASY | `mem_069e72e71365e36d` |

区間所要（WALK）: meet→1 **23** / 1→2 **21** / 2→3 **6** / 3→end **6**。

初回プラン `MODEL_SELECTED` は `deterministic/planner` のみ（実 LLM **なし**）。

#### 条件2: ローカル buildPlan 一致確認 → 記憶なし比較

**材料復元**: Firestore の `spots` + `planVersions/1` + `memories`。`ProviderCtx.cache` に LIVE の区間所要を `travel:{from}:{to}:WALK:{date}T{HH}` で seed。`orderedSpotIds` は LIVE プラン順で固定。`APP_RUNTIME=MOCK`（実 Routes を叩かない）。

| 確認 | 結果 |
| --- | --- |
| 記憶あり local vs LIVE（spot / 滞在分 / memoryIds / 区間所要） | **完全一致**（mismatches=[]） |
| 一致しなかった場合 | （該当なし。不一致なら記憶なし比較は実施しない） |

一致したため、同じ材料で **記憶なし** `buildPlan` を実行:

| spot | LIVE/記憶あり滞在 | 記憶なし滞在 | Δ | 説明 |
| --- | --- | --- | --- | --- |
| ART AQUARIUM | 35 | 50 | **−15** | `PREFER_SEATED_REST` × standing=HIGH → `min(stay,35)` |
| KITTE テラス | 50 | 50 | 0 | standing/rest が null のため directive 条件に非該当 |
| DEAN & DELUCA | 50 | 50 | 0 | rest=EASY → `max(stay,40)` で 50 のまま。ただし memoryIds に当該記憶が付く（休憩配置） |

区間所要は記憶あり／なしで同一（seed 同一）。差分はすべて `PREFER_SEATED_REST` から説明できる。

---

### ホーム提案カード LIVE 確認（2026-09-21・清澄白河 seed）

| 項目 | 値 |
| --- | --- |
| revision | `futari-log-00026-bxs`（100% traffic） |
| image / commit | `a86a616` |
| health | `ok` / `runtime=LIVE` / Firestore |
| `ENABLE_EVENT_CATALOG` | `false` |
| ロールバック | なし（デプロイ自体は正常。確認失敗はプラン条件） |
| couple / session / run | `cpl_7ed19f0b5f6143c1` / `ses_17c5ce0f85d5a8cf` / `run_8ed46641aa004515` |
| 認証 | 新規匿名（prefix `Fi4jn8SB`）。権限エラーなし |

#### カード材料（定数 DTO・LLM なし）

| 項目 | 値 |
| --- | --- |
| title / area | アートと夜カフェ / 清澄白河 |
| wish | 清澄白河で美術館や展示を楽しんだあと、夜カフェでゆっくり話すデートにしたい |
| meetPlace | 清澄白河駅 / lat=35.682163 / lng=139.798997 / id=`seed:kiyosumi-shirakawa-station` |
| 時間帯 | **15:00–21:00** |
| routeLabels | 美術館・展示 → 夜カフェ |
| 構造化カテゴリ / 候補 placeId | **なし**（表示ラベルと wish 文のみ） |

#### プラン作成リクエスト（PlanForm 相当 API）

送信・Firestore 上の `session.input` とも:

- `areaName=清澄白河駅` / `areaLat=35.682163` / `areaLng=139.798997`
- `startTime=15:00` / `endTime=21:00`
- meet/end は上記座標（`DEMO_LAT/LNG` 東京駅 **ではない**）
- `me.demoLat/demoLng` は従来どおり東京駅（場所検索バイアス用）。今回の検索中心には未使用

#### INITIAL_PLAN 結果（リトライなし・停止）

| 項目 | 値 |
| --- | --- |
| 所要 | ≈16.9 s（`waitMs=16901`） |
| status | **WAITING_INPUT** |
| question | `q_plan_unmet`「実在候補では確定プランを作れません（施設の営業時間が不明です）」 |
| 選ばれたスポット | **なし**（plan items=[]） |
| MODEL_SELECTED / 実 LLM | **なし**（`modelEvents=[]`、`initialPlanHasRealLlm=false`） |
| ホーム／カード経路の LLM | **なし**（定数 DTO） |

失敗要因（推定・修正せず）: meet の `spotId` が本物の Place ID ではなく `seed:…` のため、LIVE Places の営業時間取得ができず `OPENING_UNKNOWN` 系で unmet になった可能性が高い。検索中心・時間帯の受け渡し自体は成功。

raw: `docs/reports/live-home-suggestion-verify.json`（gitignore）

## 未実施 / TODO

- 同日複数セッションの明示選択 UI
- 承認待ち専用画面（候補は memory API に `approvalId` 付与済み）
- 本番マージ・定時ジョブ有効化（別判断）
- ホーム提案カードの meet に本物の Place ID を載せる／文言の「AI」表現整理
- 第3回 ownerUid 不一致ドキュメントの修正（監査のみ済）
