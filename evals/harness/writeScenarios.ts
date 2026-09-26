/**
 * Regenerates evals/scenarios/*.json as UTF-8 (avoid PowerShell encoding corruption).
 * Run: npx tsx evals/harness/writeScenarios.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TOKYO = {
  name: "東京駅",
  lat: 35.6812,
  lng: 139.7671,
  spotId: "mock:tokyo-station" as string | null,
};

const baseInput = (over: Record<string, unknown> = {}) => ({
  dateTokyo: "2026-09-22",
  startTime: "11:00",
  endTime: "18:00",
  meet: { ...TOKYO },
  end: { ...TOKYO },
  travelMode: "WALK",
  budget: { mealsJpy: 5000, facilitiesJpy: 2000, transitJpy: 1000 },
  preferences: [
    { id: "p1", subject: "BOTH", content: "カフェ", priority: "PREFER", source: "SELF_REPORT" },
  ],
  fixedAppointments: [] as unknown[],
  autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
  areaName: "東京駅",
  areaLat: 35.6812,
  areaLng: 139.7671,
  radiusMeters: 2500,
  ...over,
});

const scenarios: Record<string, unknown>[] = [
  {
    id: "smoke-cafe-tokyo",
    family: "smoke",
    description: "Happy path PREFER cafe near Tokyo Station mock catalog",
    input: baseInput(),
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      forbidIssueCodes: ["TRAVEL_UNKNOWN", "END_TRAVEL_UNKNOWN"],
    },
  },
  {
    id: "rain-indoor-01",
    family: "rain",
    description: "WEATHER overlay rain with cafe PREFER",
    input: baseInput({
      // Indoor-only picks under rain can cost more than the default ¥8k total.
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    overlays: [{ kind: "WEATHER", overlay: { precipitationMm: 8 } }],
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      forbidOutdoor: true,
    },
  },
  {
    id: "rain-indoor-02",
    family: "rain",
    description: "Heavy rain with park+cafe PREFER — outdoor filtered",
    input: baseInput({
      startTime: "12:00",
      endTime: "17:00",
      budget: { mealsJpy: 6000, facilitiesJpy: 2000, transitJpy: 1000 },
      preferences: [
        { id: "p1", subject: "BOTH", content: "公園", priority: "PREFER", source: "SELF_REPORT" },
        { id: "p2", subject: "BOTH", content: "カフェ", priority: "PREFER", source: "SELF_REPORT" },
      ],
    }),
    overlays: [{ kind: "WEATHER", overlay: { precipitationMm: 15 } }],
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      forbidOutdoor: true,
    },
  },
  {
    id: "must-unmet-mars",
    family: "must",
    description: "Impossible MUST (craft) → unsupported wish gate",
    input: baseInput({
      preferences: [
        {
          id: "p1",
          subject: "BOTH",
          content: "火星でものづくり体験",
          priority: "MUST",
          source: "SELF_REPORT",
        },
      ],
    }),
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_unsupported_wish", "q_must_unmet", "q_no_candidates"],
    },
  },
  {
    id: "must-unmet-onsen",
    family: "must",
    description: "MUST onsen is Places-unsupported",
    input: baseInput({
      preferences: [
        { id: "p1", subject: "BOTH", content: "温泉", priority: "MUST", source: "SELF_REPORT" },
      ],
    }),
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_unsupported_wish", "q_must_unmet", "q_no_candidates"],
    },
  },
  {
    id: "must-overflow-many",
    family: "must",
    description: "Too many MUST facets → overflow/unmet/search_range",
    input: baseInput({
      startTime: "12:00",
      endTime: "14:00",
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
      preferences: [
        { id: "p1", subject: "BOTH", content: "カフェ", priority: "MUST", source: "SELF_REPORT" },
        { id: "p2", subject: "BOTH", content: "美術館", priority: "MUST", source: "SELF_REPORT" },
        { id: "p3", subject: "BOTH", content: "書店", priority: "MUST", source: "SELF_REPORT" },
        { id: "p4", subject: "BOTH", content: "水族館", priority: "MUST", source: "SELF_REPORT" },
        { id: "p5", subject: "BOTH", content: "動物園", priority: "MUST", source: "SELF_REPORT" },
        { id: "p6", subject: "BOTH", content: "ボウリング", priority: "MUST", source: "SELF_REPORT" },
        { id: "p7", subject: "BOTH", content: "レストラン", priority: "MUST", source: "SELF_REPORT" },
      ],
    }),
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: [
        "q_must_overflow",
        "q_must_unmet",
        "q_no_candidates",
        "q_search_range",
        "q_plan_unmet",
        "q_long_walk",
      ],
    },
  },
  {
    id: "outside-tokyo-nagoya",
    family: "smoke",
    description: "Meet/end in Nagoya → q_outside_tokyo",
    input: baseInput({
      meet: { name: "名古屋駅", lat: 35.170915, lng: 136.881537, spotId: "mock:nagoya-station" },
      end: { name: "名古屋駅", lat: 35.170915, lng: 136.881537, spotId: "mock:nagoya-station" },
      areaName: "名古屋駅",
      areaLat: 35.170915,
      areaLng: 136.881537,
    }),
    expected: { outcome: "WAITING_INPUT", questionId: "q_outside_tokyo" },
  },
  {
    id: "long-walk-shinjuku-end",
    family: "long_walk",
    description: "Meet Tokyo / end Shinjuku → q_long_walk",
    input: baseInput({
      dateTokyo: "2026-09-21",
      startTime: "13:00",
      meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: null },
      end: { name: "新宿駅", lat: 35.689487, lng: 139.691706, spotId: null },
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
      preferences: [
        { id: "pref_self", subject: "SELF", content: "カフェ", priority: "PREFER", source: "SELF_REPORT" },
        {
          id: "pref_partner",
          subject: "PARTNER",
          content: "甘いもの",
          priority: "MUST",
          source: "PARTNER_STATEMENT_REPORTED",
        },
      ],
      areaName: "東京駅周辺",
      areaLat: 35.681236,
      areaLng: 139.767125,
      radiusMeters: 1500,
      tokyoAreaAcknowledged: true,
    }),
    expected: { outcome: "WAITING_INPUT", questionId: "q_long_walk" },
  },
  {
    id: "long-walk-odaiba-end",
    family: "long_walk",
    description: "End at Odaiba from Tokyo Station walk → q_long_walk",
    input: baseInput({
      end: { name: "お台場", lat: 35.627019, lng: 139.779984, spotId: null },
      tokyoAreaAcknowledged: true,
    }),
    expected: { outcome: "WAITING_INPUT", questionId: "q_long_walk" },
  },
  {
    id: "long-walk-travel-delay",
    family: "long_walk",
    description: "TRAVEL_DELAY is schedule-only; short Tokyo route still PLAN",
    input: baseInput(),
    overlays: [{ kind: "TRAVEL_DELAY", overlay: { delayMinutes: 40 } }],
    expected: { outcome: "PLAN", validationStates: ["PASS", "CONDITIONAL"] },
  },
  {
    id: "hours-ok-catalog",
    family: "hours",
    description: "Normal catalog hours still PLAN",
    input: baseInput({ startTime: "13:00", endTime: "17:00" }),
    expected: { outcome: "PLAN", validationStates: ["PASS", "CONDITIONAL"] },
  },
  {
    id: "hours-closed-monday-gallery",
    family: "hours",
    description: "Monday + MUST gallery (closed Mon) → waiting",
    input: baseInput({
      dateTokyo: "2026-09-21",
      endTime: "16:00",
      preferences: [
        { id: "p1", subject: "BOTH", content: "美術館", priority: "MUST", source: "SELF_REPORT" },
      ],
      radiusMeters: 1200,
      searchExpandAcknowledged: true,
    }),
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_plan_unmet", "q_must_unmet", "q_no_candidates"],
    },
  },
  {
    id: "fixed-time-appointment",
    family: "fixed",
    description: "TIME_FIXED cafe appointment locked into plan",
    input: baseInput({
      fixedAppointments: [
        {
          id: "fix_kitte",
          label: "KITTE cafe",
          spotId: "mock:cafe-kitte",
          spotNameHint: "カフェ 丸の内KITTE",
          startAt: "2026-09-22T14:00:00+09:00",
          endAt: "2026-09-22T15:00:00+09:00",
          kind: "TIME_FIXED",
        },
      ],
    }),
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      requireFixedAppointment: {
        label: "KITTE cafe",
        startAtContains: "T14:00",
        spotId: "mock:cafe-kitte",
      },
    },
  },
  {
    id: "fixed-time-gallery",
    family: "fixed",
    description: "TIME_FIXED gallery stop with cafe prefer",
    input: baseInput({
      startTime: "10:30",
      endTime: "17:00",
      budget: { mealsJpy: 5000, facilitiesJpy: 3000, transitJpy: 1000 },
      fixedAppointments: [
        {
          id: "fix_gallery",
          label: "Station Gallery",
          spotId: "mock:tokyo-station-gallery",
          spotNameHint: "東京ステーションギャラリー",
          startAt: "2026-09-22T11:00:00+09:00",
          endAt: "2026-09-22T12:30:00+09:00",
          kind: "TIME_FIXED",
        },
      ],
    }),
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      requireFixedAppointment: {
        label: "Station Gallery",
        startAtContains: "T11:00",
        spotId: "mock:tokyo-station-gallery",
      },
    },
  },
  {
    id: "reflect-schema-01",
    family: "reflect_schema",
    description:
      "Reflect schema validation: invalid JSON string fails Zod (not callLLM→repair E2E)",
    path: "reflect_schema",
    stubs: { llmReflect: "{not-json" },
    expected: { outcome: "FAILED" },
  },
  {
    id: "reflect-schema-02",
    family: "reflect_schema",
    description:
      "Reflect schema validation: unknown action enum fails Zod (not callLLM→repair E2E)",
    path: "reflect_schema",
    stubs: {
      llmReflect: { action: "HACK_THE_PLANET", question: null, note: null, candidates: [] },
    },
    expected: { outcome: "FAILED" },
  },
  {
    id: "api-fail-places",
    family: "api_fail",
    description: "Places search throw via ctx.stubs.places.fail → empty scout → waiting",
    input: baseInput({
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    stubs: { places: { fail: true } },
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_no_candidates", "q_plan_unmet", "q_search_range"],
    },
  },
  {
    id: "api-fail-routes",
    family: "api_fail",
    description: "Routes UNKNOWN via ctx.stubs.routes.fail (no haversine fill)",
    input: baseInput({
      // null meet/end spotIds so legs hit mock-routes path (not catalog↔catalog shortcut)
      meet: { name: "東京駅", lat: 35.6812, lng: 139.7671, spotId: null },
      end: { name: "東京駅", lat: 35.6812, lng: 139.7671, spotId: null },
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    stubs: { routes: { fail: true } },
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_travel_unverified"],
      requireIssueCodes: ["TRAVEL_UNKNOWN"],
      forbidHaversineAssumption: true,
    },
  },
  {
    id: "api-fail-places-empty",
    family: "api_fail",
    description: "Places empty results via ctx.stubs.places.empty",
    input: baseInput({
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    stubs: { places: { empty: true } },
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_no_candidates", "q_search_range", "q_plan_unmet"],
    },
  },
  {
    id: "full-spot-overlay",
    family: "full",
    description: "SPOT_FULL on kitte → CLOSED inject; self-correct to other cafe → PLAN",
    input: baseInput({
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    overlays: [{ kind: "SPOT_FULL", target: { spotId: "mock:cafe-kitte" }, overlay: {} }],
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      forbidSpotIds: ["mock:cafe-kitte"],
    },
  },
  {
    id: "full-spot-alt",
    family: "full",
    description: "SPOT_FULL on both nearby cafes → unmet / plan unmet",
    input: baseInput({
      preferences: [
        { id: "p1", subject: "BOTH", content: "カフェ", priority: "MUST", source: "SELF_REPORT" },
      ],
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
      radiusMeters: 1200,
      searchExpandAcknowledged: true,
    }),
    overlays: [
      { kind: "SPOT_FULL", target: { spotId: "mock:cafe-kitte" }, overlay: {} },
      { kind: "SPOT_FULL", target: { spotId: "mock:cafe-gransta" }, overlay: {} },
    ],
    expected: {
      outcome: "WAITING_INPUT",
      questionIds: ["q_plan_unmet", "q_must_unmet", "q_no_candidates"],
      forbidSpotIds: ["mock:cafe-kitte", "mock:cafe-gransta"],
    },
  },
  {
    id: "replan-replace-cafe",
    family: "replan",
    description: "INITIAL then REPLAN replace first item (別のカフェにして)",
    input: baseInput({
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    replan: { instruction: "別のカフェにして", targetFirstItem: true },
    expected: {
      outcome: "PLAN",
      validationStates: ["PASS", "CONDITIONAL"],
      replanChangedFirstSpot: true,
    },
  },
  {
    id: "replan-time-skip",
    family: "replan",
    description: "REPLAN time adjust — deferred (needs assert on timeShifts)",
    skip: true,
    skipReason:
      "Unskip: add expected.requireTimeShift + harness assert on plan.diff.timeShifts after replan.instruction like ゆっくり",
    input: baseInput({
      budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    }),
    replan: { instruction: "ゆっくり過ごしたい", targetFirstItem: false },
    expected: { outcome: "PLAN", validationStates: ["PASS", "CONDITIONAL"] },
  },
  {
    id: "replan-protected-skip",
    family: "replan",
    description: "REPLAN against protected TIME_FIXED item — deferred",
    skip: true,
    skipReason:
      "Unskip: seed FIXED appointment in INITIAL plan then REPLAN targeting that locked item; expect q_replan_no_change",
    expected: { outcome: "WAITING_INPUT", questionIds: ["q_replan_no_change"] },
  },
  {
    id: "memory-conflict-01",
    family: "memory_conflict",
    description: "NOTE_CONFLICT reflect path — deferred to LLM mock harness",
    skip: true,
    skipReason:
      "Unskip: path reflect_analyze with ProviderCtx/LLM mock returning action NOTE_CONFLICT (wire callLLM mock in harness)",
    expected: { outcome: "WAITING_INPUT" },
  },
  {
    id: "memory-conflict-02",
    family: "memory_conflict",
    description: "NEXT_DATE memory binding after approval — deferred",
    skip: true,
    skipReason:
      "Unskip: seed approved Memory with scope NEXT_DATE + targetSessionId, run INITIAL_PLAN, assert directive binding",
    expected: { outcome: "PLAN", validationStates: ["PASS", "CONDITIONAL"] },
  },
];

const dir = join(process.cwd(), "evals", "scenarios");
mkdirSync(dir, { recursive: true });
for (const scenario of scenarios) {
  const id = String(scenario.id);
  writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
}
console.log(`wrote ${scenarios.length} scenarios to ${dir}`);
