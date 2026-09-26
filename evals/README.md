# Eval harness

Deterministic planning regression under `APP_RUNTIME=MOCK` + `DATA_BACKEND=file`.

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
| `family` | Scenario family (`rain`, `must`, `long_walk`, …) |
| `input` | PlanningInput (required for `path: orchestrate`) |
| `overlays` | Partial scenario overlays (session ids filled by harness) |
| `stubs.placeHours` | Optional `ProviderCtx.placeHours` injection |
| `stubs.places.fail` / `empty` | Force Places search throw or empty list (`ProviderCtx.stubs`) |
| `stubs.routes.fail` | Force Routes UNKNOWN (no haversine fill) |
| `stubs.llmReflect` | Payload for `path: reflect_schema` |
| `replan` | Run INITIAL first, seed `planHistory`, then REPLAN with `instruction` |
| `path` | `orchestrate` (default) or `reflect_schema` |
| `skip` / `skipReason` | Document unfinished fixtures without failing CI |
| `expected.outcome` | `PLAN` \| `WAITING_INPUT` \| `FAILED` |
| `expected.questionId` / `questionIds` | Allowed waiting question ids |
| `expected.forbidIssueCodes` / `requireIssueCodes` | Plan issue codes |
| `expected.validationStates` | Allowed `validatePlan` states when outcome is PLAN |

## How to unskip remaining fixtures

| Family | What to do |
|---|---|
| `replan-time-skip` | Assert `timeShifts` after `replan.instruction` like `ゆっくり`; extend `expected` + assert |
| `replan-protected-skip` | Seed TIME_FIXED locked item then REPLAN targeting it → `q_replan_no_change` |
| `memory-conflict-*` | Add `path: reflect_analyze` with mocked `callLLM` (`NOTE_CONFLICT`) / seed NEXT_DATE memories |

## Metrics (every run)

`plan_success`, `constraint_violation`, `unnecessary_confirmation`, `api_calls` (by provider via `onHttp`), `latency_ms`, `cost`.

## Boundaries

`evals/` may import `@/server`, `@/domain`, `@/contracts`, `@/config`. Do **not** import `@/features` or other UI layers.
