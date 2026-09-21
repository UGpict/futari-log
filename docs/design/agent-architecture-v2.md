# Design: AI エージェント構成 v2

## データ流

```
[Home 振り返り UI]
  → POST /api/sessions/{id}/reflections  （即時保存、LLM 待たない）
  → insertPendingRun(kind=REFLECTION, reflectionId, contentVersion)
  → Worker executeRun → analyzeReflection
       ├─ ASK_ONE → WAITING_INPUT（lease 解放）
       ├─ CREATE_CANDIDATES → memoryCandidates + MEMORY_SAVE(targetCandidateId)
       ├─ NOTE_CONFLICT / DONE → SUCCEEDED
       └─ 失敗 → run FAILED、reflection.analysisStatus=FAILED（本文は残す）

[承認 UI / API]
  → POST /api/approvals/{id}/decision
  → candidateId で記憶化（PRIVATE）。仮説は拒否。

[次回 INITIAL_PLAN]
  → canReadMemory + planDirectives → buildPlan（LLM 0）
  → CONFIRMED 時に NEXT_DATE を sessionId へ束縛
```

## スキーマ拡張要点

### Reflection

既存に追加: `planVersion`, `dateTokyo`, `title`, `mood`, `visits[]`, `contentVersion`, `analysisStatus`, `analysisRunId`, `updatedAt`。`rawNote`/`maskedNote` は維持。

### Memory / Candidate

`planDirectives: MemoryPlanDirective[]`, `reflectionVersion`。  
Directive kind: `PREFER_SEATED_REST` | `SHORTEN_CATEGORY_STAY` | `REVISIT_SPOT` | `PREFER_NEW_SPOTS` | `WALK_HARD_CAP`（HARD 明示承認時のみ数値）。

### Approval

`targetCandidateId`, `targetMemoryId`, `expectedVersion`。マッチングは ID のみ。

### Run

任意: `reflectionId`, `reflectionContentVersion`（分析ジョブの紐付け）。

## モジュール

| 場所 | 役割 |
| --- | --- |
| `src/contracts/reflection.ts` | 入出力 DTO |
| `src/contracts/memory.ts` | 候補・承認フィールド拡張 |
| `src/domain/memory/directives.ts` | directive 解釈ヘルパ |
| `src/domain/memory/apply.ts` | NEXT_DATE 束縛 |
| `src/server/agent/reflectAnalyze.ts` | 分析 LLM アクション |
| `src/server/agent/execute.ts` | runReflection 差し替え |
| `src/server/agent/buildPlan.ts` | directive ベース適用 |
| `src/server/catalog/suggest.ts` | 通常候補向けカタログ提案 |
| `src/server/catalog/ingest.ts` | JST 期間・エリア座標 |

## 旧実装との差分（bc5deb5 時点比）

| 旧 | 新 |
| --- | --- |
| ホーム振り返り = localStorage のみ | セッション紐付け API + ローカルは残置 |
| runReflection = 固定4択 + スタブ LLM | 自由記述分析、任意1問、候補生成 |
| 候補 sourceType を PARTNER_STATEMENT に固定 | 観察／自己報告／報告発言／仮説を区別 |
| 承認が summary.includes | targetCandidateId |
| buildPlan が /立\|歩/ | planDirectives |
| resolveWalkHardTotal が本文 regex | WALK_HARD_CAP directive（HARD） |
| ingest 既定 demoDate | JST 当日〜週末（未指定時） |

## TODO（未決・後続）

- ホームカレンダーで同日複数セッション時のセッション選択 UI の細部（現状: DONE/REFLECTED が1件なら自動、複数なら先頭＋注意）。
- 承認待ち一覧 UI の専用画面（API は返す。既存 memory 画面へ候補表示を追加）。
- カタログ店舗の Places 不足時フォールバックの費用上限チューニング。
- 本番 Scheduler cron 式の確定（手動検証後）。
