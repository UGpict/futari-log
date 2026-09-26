import { z } from "zod";
import { planningInputSchema } from "@/contracts/planning";

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
   * stubs.llmReflect must fail Zod parse.
   */
  path: z.enum(["orchestrate", "reflect_schema"]).optional(),
  input: planningInputSchema.optional(),
  overlays: z.array(evalOverlaySpecSchema).optional(),
  stubs: evalProviderStubsSchema,
  /** When set, harness runs INITIAL_PLAN first, seeds planHistory, then REPLAN. */
  replan: evalReplanSpecSchema,
  expected: evalExpectedSchema,
});

export type EvalFamily = z.infer<typeof evalFamilySchema>;
export type EvalOutcome = z.infer<typeof evalOutcomeSchema>;
export type EvalOverlaySpec = z.infer<typeof evalOverlaySpecSchema>;
export type EvalExpected = z.infer<typeof evalExpectedSchema>;
export type EvalScenario = z.infer<typeof evalScenarioSchema>;
