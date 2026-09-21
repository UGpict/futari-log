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

---

### 32973b1 デプロイ + LIVE 多エリア確認（2026-09-21・敬老の日）

**当日は祝日（敬老の日 / 2026-09-21・月曜）。** `regularOpeningHours` だけだと月曜休館の施設が CLOSED になりやすい一方、Places の `currentOpeningHours`（`periods[].open.date` が当日一致）を優先する 32973b1 の判定で、祝日営業が OPEN として採用された。

#### デプロイ前

| 項目 | 結果 |
| --- | --- |
| `npx tsc --noEmit` | **PASS** |
| `npm run check:boundaries` | **PASS** |
| `npm test` | **PASS（130）** |
| `git status` | クリーン（HEAD=`32973b1`） |
| push | `32973b1` → `origin/feature/agent-architecture-v2` |

#### デプロイ

| 項目 | 値 |
| --- | --- |
| 手順 | 前回同様 `DEPLOY_RUNTIME=LIVE` / `npm run deploy:cloudrun` |
| image | `asia-northeast1-docker.pkg.dev/futari-log-agent/futari-log/app:32973b1` |
| revision | **`futari-log-00028-sdj`**（traffic **100%**） |
| `ENABLE_EVENT_CATALOG` | **`false`** |
| health | `ok` / `runtime=LIVE` / `authBackend=firebase` / `dataBackend=firestore` / `emulator=false` |
| ロールバック | **なし**（異常なし。`futari-log-00026-bxs` への切戻し未実施） |
| 補足 | デプロイ末尾の Identity Toolkit 許可ドメイン更新は既知の exit 127。サービス本体は正常 |

#### (A) 提案カード（最優先）

カード定数どおり「この案でプランをつくる」相当 API（匿名 Bearer → couples → sessions → INITIAL_PLAN）。

| 項目 | 値 |
| --- | --- |
| couple / session / run | `cpl_c068e1df3c25621d` / `ses_f0f6143ea3d0c315` / `run_287cb7f5ac155be8` |
| 検索中心 | **清澄白河駅** / lat=35.682163 / lng=139.798997 / Place ID=`ChIJaX6cwT2JGGARKz3KrG7DRWU`（seed ではない） |
| 時間帯 | **15:00–21:00**（`dateTokyo=2026-09-21`） |
| 結果 | **SUCCEEDED**（`q_plan_unmet` なし） |
| 所要 | waitMs ≈ **15.1 s** |
| 差し替え | **0**（`SELF_CORRECTED=0`） |
| 実 LLM | **なし**（`deterministic/planner` のみ） |

選ばれたスポットと営業ソース:

| スポット | 集合からの距離 | plan opening | hours ソース | datedOnly | regularOnly |
| --- | --- | --- | --- | --- | --- |
| Museum of Contemporary Art Tokyo (MOT) | 873 m | OPEN | **currentOpeningHours**（当日 date 一致） | OPEN | **CLOSED** |
| Kiyosumi Garden | 119 m | UNKNOWN | none（hours 欠測） | — | UNKNOWN |
| ヒキダシ | 38 m | UNKNOWN | none | — | UNKNOWN |

→ MOT は祝日判定の効き目が明示的: `regular` なら月曜 CLOSED で落ちるが、`current` の 2026-09-21 付き期間で OPEN。UNKNOWN 2件は OPENING_UNKNOWN（severity=UNKNOWN）で unmet にはならずプラン適用。

#### (B) 東京の複数エリア（各駅 Places 先頭候補の本物 Place ID）

希望文共通: 「美術館や展示を楽しんだあと、カフェでゆっくり話すデートにしたい」／15:00–21:00／WALK。失敗してもリトライなし。認証・権限エラーなし。

| エリア | Place ID（先頭） | 座標 | 中心名 | q_outside_tokyo | 結果 | 選ばれたスポット（距離） | CLOSED/UNKNOWN（最終行程） | 差し替え | waitMs | 経路 LLM |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 東京駅・丸の内 | `ChIJC3Cf2PuLGGAROO00ukl8JwA` | 35.6813, 139.7671 | 東京駅 | 否 | SUCCEEDED | Ginza Itoya(909) / のぞみ広場(233) / Burdigala Tokyo(10) | のぞみ広場 UNKNOWN | 0 | 15525 | なし |
| 渋谷 | `ChIJnxAAO1aLGGARJqvi8d4oczM` | 35.6580, 139.7016 | 渋谷駅 | 否 | SUCCEEDED | East Exit Square(136 UNKNOWN) / PARIYA(36) / Inari Bridge Plaza(137) | East Exit Square UNKNOWN | **1** | 19937 | なし |
| 新宿 | `ChIJH7qx1tCMGGAR1f2s7PGhMhw` | 35.6896, 139.7006 | 新宿駅 | 否 | SUCCEEDED | Sekaido(528) / Suica Penguin Park(187) / Beck's Coffee(7) | （なし） | 0 | 15417 | なし |
| 浅草 | `ChIJL34SkMaOGGAR8M8COhoCH_Q` | 35.7099, 139.7972 | 浅草駅 | 否 | SUCCEEDED | Tobacco & Salt Museum(1124) / Sumida Riverside Terrace(102 UNKNOWN) / ベローチェ雷門(35) | Terrace UNKNOWN | 0 | 13465 | なし |
| 吉祥寺 | `ChIJw2wi9kfuGGARTirViZm25jQ` | 35.7031, 139.5798 | 吉祥寺駅 | 否 | SUCCEEDED | Ghibli Museum(1143) / Kichijojiminami Park(223) / Gong cha atré(8) | （なし） | 0 | 13226 | なし |
| 下北沢 | `ChIJM2EpmmvzGGARXV5tNZ86xGY` | 35.6616, 139.6669 | 下北沢駅 | 否 | **WAITING_INPUT `q_long_walk`** | （プラン未適用・items=[]） | — | 0 | 13203 | なし |
| 清澄白河 | `ChIJaX6cwT2JGGARKz3KrG7DRWU` | 35.6823, 139.7988 | 清澄白河駅 | 否 | SUCCEEDED | MOT(895) / Kiyosumi Garden(121 UNKNOWN) / ヒキダシ(19 UNKNOWN) | Garden・ヒキダシ UNKNOWN | 0 | 13237 | なし |

渋谷の差し替え: `VALIDATION_FAILED` → NOTICE「差し替え補充: OPEN確認 3件 / 照会 1件」→ `SELF_CORRECTED` 1回 → PLAN_APPLIED。最終 Inari Bridge Plaza は dated=OPEN / regular=**CLOSED**（祝日 current）。

下北沢失敗（プラン未確定）: Japan Folk Crafts Museum → 下北沢駅南西口広場が徒歩27分で `q_long_walk`。営業 unmet・域外ではない。リトライなしで記録のみ。

#### 集計

| 区分 | 件数 | 備考 |
| --- | --- | --- |
| (A)+(B) 試行 | 8 | 提案1 + エリア7 |
| SUCCEEDED（行程適用） | **7 / 8（87.5%）** | `q_plan_unmet` **0** |
| WAITING_INPUT（非 unmet） | **1 / 8** | 下北沢 = `q_long_walk`（徒歩同意） |
| 認証・権限エラー | 0 | 停止条件未発火 |
| `q_outside_tokyo` | 0 | 全エリアで否 |
| 初回プラン経路の実 LLM | 0 | 全 run `deterministic/planner` または MODEL_SELECTED なし |
| 差し替え発生 | 渋谷のみ 1回 | 他は 0 |

失敗・非成功の原因分類:

1. **徒歩閾値（`q_long_walk`）** — 下北沢のみ。祝日 hours 修正とは無関係。
2. **営業 unmet（`q_plan_unmet`）** — **今回ゼロ**（前回 seed meet + regular 月曜休で unmet だった清澄白河提案は解消）。
3. **域外 / 認証** — なし。

祝日 × `currentOpeningHours` の効き（dated=OPEN かつ regular=CLOSED で最終採用された例）:

| スポット | 出現エリア |
| --- | --- |
| MOT | (A) 提案カード、清澄白河 |
| Inari Bridge Plaza | 渋谷 |
| Suica Penguin Park | 新宿 |
| Tobacco & Salt Museum | 浅草 |
| Kichijojiminami Park | 吉祥寺 |

→ 敬老の日に `regular` だけなら CLOSED 扱いだった候補が、`current` の当日日付一致で OPEN になり行程に載った。これが提案カード SUCCEEDED の主因。

生ログ（gitignore）: `docs/reports/live-areas-verify-32973b1-raw.json`

## 未実施 / TODO

- 同日複数セッションの明示選択 UI
- 承認待ち専用画面（候補は memory API に `approvalId` 付与済み）
- 本番マージ・定時ジョブ有効化（別判断）
- ホーム提案カード文言の「AI」表現整理（meet の本物 Place ID は 32973b1 で反映・LIVE 確認済）
- 第3回 ownerUid 不一致ドキュメントの修正（監査のみ済）
