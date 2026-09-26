import { z } from "zod";
import { planningInputSchema } from "@/contracts/planning";
import { memoryPlanDirectiveSchema } from "@/domain/schemas";

export const evalFamilySchema = z.enum([
  "smoke",
  "rain",
  "full",
  "long_walk",
  "hours",
  "must",
  "replan",
  "fixed",
  "api_fail",
  "reflect_schema",
  "memory_conflict",
]);

export const evalOutcomeSchema = z.enum(["PLAN", "WAITING_INPUT", "FAILED"]);

export const evalOverlaySpecSchema = z.object({
  kind: z.enum(["WEATHER", "SPOT_FULL", "TRAVEL_DELAY", "DEMO_CLOCK"]),
  target: z
    .object({
      spotId: z.string().nullable().optional(),
      legId: z.string().nullable().optional(),
      from: z.string().nullable().optional(),
      to: z.string().nullable().optional(),
    })
    .optional(),
  overlay: z.record(z.string(), z.unknown()).optional(),
});

export const evalFixedAppointmentExpectSchema = z.object({
  /** Match fixedAppointments[].label → spotId must appear locked on the plan. */
  label: z.string().optional(),
  /** Locked item startAt must include this substring (e.g. "T14:00"). */
  startAtContains: z.string().optional(),
  /** Prefer matching this spotId directly when set. */
  spotId: z.string().optional(),
});

export const evalSeedMemorySchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  scope: z.enum(["NEXT_DATE", "ONGOING"]).default("NEXT_DATE"),
  /** When true (default for NEXT_DATE), set targetSessionId to the seeded session. */
  bindToSession: z.boolean().optional(),
  strength: z.enum(["SOFT", "HARD"]).default("SOFT"),
  type: z.enum(["CARE", "PREFERENCE", "CONSTRAINT"]).default("CARE"),
  planDirectives: z.array(memoryPlanDirectiveSchema).default([]),
});

export const evalExpectedSchema = z.object({
  outcome: evalOutcomeSchema,
  /** Exact question id, or any of questionIds. */
  questionId: z.string().optional(),
  questionIds: z.array(z.string()).optional(),
  forbidIssueCodes: z.array(z.string()).optional(),
  requireIssueCodes: z.array(z.string()).optional(),
  maxApiCalls: z.number().int().nonnegative().optional(),
  maxLatencyMs: z.number().int().positive().optional(),
  /** When outcome is PLAN, optionally require validation.state. */
  validationStates: z.array(z.enum(["PASS", "CONDITIONAL", "FAIL"])).optional(),
  /** None of these spotIds may appear in built.plan.items. */
  forbidSpotIds: z.array(z.string()).optional(),
  /** All of these spotIds must appear in built.plan.items. */
  requireSpotIds: z.array(z.string()).optional(),
  /** REPLAN: first item spotId must differ from INITIAL first item. */
  replanChangedFirstSpot: z.boolean().optional(),
  /** REPLAN: plan.diff.timeShifts must be non-empty (e.g. ゆっくり dwell bump). */
  requireTimeShift: z.boolean().optional(),
  /** Locked TIME_FIXED item must preserve appointment time. */
  requireFixedAppointment: evalFixedAppointmentExpectSchema.optional(),
  /** No plan item whose spot.environment is OUTDOOR. */
  forbidOutdoor: z.boolean().optional(),
  /**
   * Plan must not claim haversine / 直線距離代用 as filled travel.
   * Negated wording ("直線距離では代用しない") is allowed.
   */
  forbidHaversineAssumption: z.boolean().optional(),
  /** reflect_analyze: require this action from analyzeReflectionNote. */
  requireReflectAction: z
    .enum(["DONE", "ASK_ONE", "CREATE_CANDIDATES", "NOTE_CONFLICT"])
    .optional(),
  /** Plan.memoryInfluences must include at least one of these effects. */
  requireMemoryInfluenceEffects: z
    .array(z.enum(["PRIORITY", "DURATION", "REST_INSERT", "NONE"]))
    .optional(),
  /** Plan.memoryInfluences must reference these memory ids. */
  requireMemoryInfluenceIds: z.array(z.string()).optional(),
});

export const evalProviderStubsSchema = z
  .object({
    placeHours: z.record(z.string(), z.unknown()).optional(),
    llmReflect: z.unknown().optional(),
    places: z
      .object({
        fail: z.boolean().optional(),
        empty: z.boolean().optional(),
      })
      .optional(),
    routes: z
      .object({
        fail: z.boolean().optional(),
      })
      .optional(),
    weather: z.unknown().optional(),
  })
  .optional();

export const evalReplanSpecSchema = z
  .object({
    /** Japanese instruction that classifyReplanIntent understands (e.g. 別のカフェにして). */
    instruction: z.string().min(1),
    /** When true (default), target the first item of the seeded INITIAL plan. */
    targetFirstItem: z.boolean().optional(),
    /** When true, target the first locked (TIME_FIXED) item instead of first item. */
    targetLockedItem: z.boolean().optional(),
  })
  .optional();

export const evalScenarioSchema = z.object({
  id: z.string().min(1),
  family: evalFamilySchema,
  description: z.string().optional(),
  /** Skip without failing the suite (document why). */
  skip: z.boolean().optional(),
  skipReason: z.string().optional(),
  /**
   * orchestrate = full planning (default).
   * reflect_schema = unit-style Zod validation only (not callLLM→repair E2E).
   * reflect_analyze = analyzeReflectionNote with stubs.llmReflect as mockOverride (MOCK stub; not LIVE E2E).
   * stubs.llmReflect must fail Zod parse for reflect_schema; must be valid NOTE_CONFLICT (etc.) for reflect_analyze.
   */
  path: z.enum(["orchestrate", "reflect_schema", "reflect_analyze"]).optional(),
  input: planningInputSchema.optional(),
  overlays: z.array(evalOverlaySpecSchema).optional(),
  stubs: evalProviderStubsSchema,
  /** When set, harness runs INITIAL_PLAN first, seeds planHistory, then REPLAN. */
  replan: evalReplanSpecSchema,
  /** Approved memories passed into orchestratePlanning (and optionally bound to session). */
  seedMemories: z.array(evalSeedMemorySchema).optional(),
  expected: evalExpectedSchema,
});

export type EvalFamily = z.infer<typeof evalFamilySchema>;
export type EvalOutcome = z.infer<typeof evalOutcomeSchema>;
export type EvalOverlaySpec = z.infer<typeof evalOverlaySpecSchema>;
export type EvalExpected = z.infer<typeof evalExpectedSchema>;
export type EvalScenario = z.infer<typeof evalScenarioSchema>;
export type EvalSeedMemory = z.infer<typeof evalSeedMemorySchema>;
