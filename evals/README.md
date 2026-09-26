# Eval harness

Deterministic planning regression under `APP_RUNTIME=MOCK` + `DATA_BACKEND=file`.

**Honesty:** Phase1 is not zero product-behavior change. It adds `ProviderCtx.stubs` (eval injection through real `searchSpots` / `estimateTravel`), maps `SPOT_FULL` → `CLOSED` (full spots unavailable to planner), `reflect_schema` / `reflect_analyze` fixtures that are Zod or MOCK `mockOverride` only — not full LIVE `callLLM`→repair E2E — and lengthens dwell on REPLAN `ゆっくり` so `diff.timeShifts` is observable.

## Run

```bash
npm run eval
```

Writes `evals/out/latest.json` (gitignored) and prints a summary table. Exit code 1 if any scenario fails (skips do not fail the suite).

Each run uses an isolated `STORE_DIR` temp directory so it never touches `.data/`.

Regenerate UTF-8 scenario JSON from the TS source of truth:

```bash
npx tsx evals/harness/writeScenarios.ts
```

## Fixture format

One JSON file per scenario under `evals/scenarios/`:

```json
{
  "id": "smoke-cafe-tokyo",
  "family": "smoke",
  "input": { "...PlanningInput..." },
  "overlays": [{ "kind": "WEATHER", "overlay": { "precipitationMm": 8 } }],
  "stubs": { "places": { "fail": true }, "routes": { "fail": true } },
  "replan": { "instruction": "別のカフェにして", "targetFirstItem": true },
  "expected": {
    "outcome": "PLAN",
    "validationStates": ["PASS", "CONDITIONAL"],
    "questionIds": ["q_outside_tokyo"]
  }
}
```

Fields:

| Field | Meaning |
|---|---|
| `family` | Scenario family (`rain`, `must`, `reflect_schema`, …). `reflect_schema` was formerly `llm_bad_json` |
| `input` | PlanningInput (required for `path: orchestrate`) |
| `overlays` | Partial scenario overlays (session ids filled by harness) |
| `stubs.placeHours` | Optional `ProviderCtx.placeHours` injection |
| `stubs.places.fail` / `empty` | Force Places search throw or empty list via real `searchSpots` (`ProviderCtx.stubs`) |
| `stubs.routes.fail` | Force Routes UNKNOWN via real `estimateTravel` (no haversine fill) |
| `stubs.llmReflect` | Payload for `path: reflect_schema` (Zod-only) or `path: reflect_analyze` (`mockOverride` into `analyzeReflectionNote`; MOCK stub, not LIVE E2E) |
| `replan` | Run INITIAL first, seed `planHistory`, then REPLAN with `instruction` (`targetLockedItem` targets TIME_FIXED) |
| `seedMemories` | Approved memories for orchestrate (NEXT_DATE may `bindToSession`) |
| `path` | `orchestrate` (default), `reflect_schema` (Zod-only), or `reflect_analyze` (MOCK `analyzeReflectionNote`) |
| `skip` / `skipReason` | Document unfinished fixtures without failing CI |
| `expected.outcome` | `PLAN` \| `WAITING_INPUT` \| `FAILED` |
| `expected.questionId` / `questionIds` | Allowed waiting question ids |
| `expected.forbidIssueCodes` / `requireIssueCodes` | Plan issue codes |
| `expected.validationStates` | Allowed `validatePlan` states when outcome is PLAN |
| `expected.forbidSpotIds` / `requireSpotIds` | Spot ids that must be absent / present on `built.plan.items` |
| `expected.replanChangedFirstSpot` | First item spotId must differ from INITIAL seed |
| `expected.requireTimeShift` | REPLAN `plan.diff.timeShifts` must be non-empty |
| `expected.requireFixedAppointment` | Locked TIME_FIXED item (`label` / `startAtContains` / `spotId`) |
| `expected.forbidOutdoor` | No item with `spot.environment === OUTDOOR` (rain product filter) |
| `expected.forbidHaversineAssumption` | Assumptions must not claim haversine / 直線距離代用 fill |
| `expected.requireReflectAction` | `reflect_analyze` action (e.g. `NOTE_CONFLICT`) |
| `expected.requireMemoryInfluenceIds` / `Effects` | Plan `memoryInfluences` from seeded directives |

## How to unskip remaining fixtures

| Family | What to do |
|---|---|
| ~~`replan-time-skip`~~ | Done: `requireTimeShift` + `diffPlan` observe; buildPlan lengthens dwell on ゆっくり |
| ~~`replan-protected-skip`~~ | Done: seed TIME_FIXED + `replan.targetLockedItem` → `q_replan_no_change` |
| ~~`memory-conflict-*`~~ | Done: `path: reflect_analyze` + `mockOverride` for NOTE_CONFLICT; `seedMemories` for NEXT_DATE directives |

*(Phase 1.5: 26 fixtures, 0 skip target.)*

## Metrics (every run)

`plan_success`, `constraint_violation`, `unnecessary_confirmation`, `api_calls` (by provider via `onHttp`), `latency_ms`, `cost`.

## Boundaries

`evals/` may import `@/server`, `@/domain`, `@/contracts`, `@/config`. Do **not** import `@/features` or other UI layers.
