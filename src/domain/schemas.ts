import { z } from "zod";
import { planningInputSchema, travelModeSchema } from "@/contracts/planning";

export {
  preferenceSchema,
  type Preference,
  travelModeSchema,
  type TravelMode,
  fixedAppointmentSchema,
  type FixedAppointment,
  budgetSchema,
  type Budget,
  autoApplyPolicySchema,
  type AutoApplyPolicy,
  meetPointSchema,
  planningInputSchema,
  type PlanningInput,
} from "@/contracts/planning";


export const modeSchema = z.enum(["LIVE", "LIVE_SCENARIO", "REPLAY"]);
export type Mode = z.infer<typeof modeSchema>;

export const sourceKindSchema = z.enum([
  "API",
  "CACHE",
  "ESTIMATED",
  "INJECTED",
  "USER",
  "UNKNOWN",
]);
export type SourceKind = z.infer<typeof sourceKindSchema>;

export const evidenceSchema = z.object({
  id: z.string(),
  kind: sourceKindSchema,
  provider: z.string().nullable(),
  sourceRef: z.string().nullable(),
  sourceField: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  validFor: z
    .object({
      from: z.string(),
      to: z.string(),
    })
    .nullable(),
  note: z.string().nullable(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export function factSchema<T extends z.ZodType>(value: T) {
  return z.object({
    value: value.nullable(),
    evidenceIds: z.array(z.string()),
  });
}

export const environmentSchema = z.enum(["INDOOR", "OUTDOOR", "MIXED"]);
export const restEaseSchema = z.enum(["EASY", "LIMITED"]);
export const standingBurdenSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const spotSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  categories: z.array(z.string()),
  environment: factSchema(environmentSchema),
  costForTwoJpy: factSchema(
    z.object({
      min: z.number(),
      max: z.number(),
    }),
  ),
  restEase: factSchema(restEaseSchema),
  standingBurden: factSchema(standingBurdenSchema),
  officialUrl: z.string().nullable(),
});
export type Spot = z.infer<typeof spotSchema>;

export const planItemSchema = z.object({
  id: z.string(),
  spotId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE"]),
  locked: z.boolean(),
  lockReason: z.string().nullable(),
  matchesPreferenceIds: z.array(z.string()),
  memoryIds: z.array(z.string()),
  reason: z.string(),
  evidenceIds: z.array(z.string()),
});
export type PlanItem = z.infer<typeof planItemSchema>;

export const travelLegSchema = z.object({
  id: z.string(),
  from: z.enum(["MEET", "SPOT", "END"]),
  fromSpotId: z.string().nullable(),
  to: z.enum(["SPOT", "END"]),
  toSpotId: z.string().nullable(),
  mode: travelModeSchema,
  departureAt: z.string(),
  durationMinutes: factSchema(z.number()),
  distanceMeters: factSchema(z.number()),
  delayMinutesInjected: z.number().nullable(),
  evidenceIds: z.array(z.string()),
});
export type TravelLeg = z.infer<typeof travelLegSchema>;

export const openingStateSchema = z.enum(["OPEN", "CLOSED", "UNKNOWN"]);
export const openingAssessmentSchema = z.object({
  spotId: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  state: openingStateSchema,
  evidenceIds: z.array(z.string()),
});
export type OpeningAssessment = z.infer<typeof openingAssessmentSchema>;

export const validationIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["ERROR", "UNKNOWN", "WARNING"]),
  itemIds: z.array(z.string()),
  message: z.string(),
  evidenceIds: z.array(z.string()),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationResultSchema = z.object({
  state: z.enum(["PASS", "CONDITIONAL", "FAIL"]),
  issues: z.array(validationIssueSchema),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const planBSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  itemId: z.string(),
  candidateSpotId: z.string().nullable(),
  policy: z.string().nullable(),
  validation: validationResultSchema.nullable(),
  verifiedAt: z.string().nullable(),
  isVerifiedAlternative: z.boolean(),
});
export type PlanB = z.infer<typeof planBSchema>;

export const costEstimateSchema = z.object({
  mealsJpy: factSchema(z.number()),
  facilitiesJpy: factSchema(z.number()),
  transitJpy: factSchema(z.number()),
  totalJpy: factSchema(z.number()),
});

export const planSchema = z.object({
  version: z.number().int().positive(),
  items: z.array(planItemSchema),
  legs: z.array(travelLegSchema),
  openings: z.array(openingAssessmentSchema),
  assumptions: z.array(z.string()),
  validation: validationResultSchema,
  planB: z.array(planBSchema),
  costEstimate: costEstimateSchema,
  dataMode: modeSchema,
  memoryInfluences: z.array(
    z.object({
      memoryId: z.string(),
      effect: z.enum(["PRIORITY", "DURATION", "REST_INSERT", "NONE"]),
      detail: z.string(),
    }),
  ),
});
export type Plan = z.infer<typeof planSchema>;

export const planDiffSchema = z.object({
  fromVersion: z.number(),
  toVersion: z.number(),
  keptItemIds: z.array(z.string()),
  replaced: z.array(
    z.object({
      fromItemId: z.string(),
      toItemId: z.string(),
      fromSpotId: z.string(),
      toSpotId: z.string(),
    }),
  ),
  addedItemIds: z.array(z.string()),
  removedItemIds: z.array(z.string()),
  timeShifts: z.array(
    z.object({
      itemId: z.string(),
      startDeltaMin: z.number(),
      endDeltaMin: z.number(),
    }),
  ),
  summary: z.string(),
});
export type PlanDiff = z.infer<typeof planDiffSchema>;

export const memoryCandidateSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  sessionId: z.string(),
  reflectionId: z.string(),
  answerId: z.string().nullable(),
  subject: z.enum(["SELF", "PARTNER", "BOTH"]),
  type: z.enum(["CARE", "PREFERENCE", "CONSTRAINT"]),
  content: z.string(),
  sourceType: z.enum([
    "SELF_REPORT",
    "PARTNER_STATEMENT_REPORTED",
    "OBSERVATION",
    "HYPOTHESIS",
  ]),
  evidenceQuote: z.string(),
  strength: z.enum(["SOFT", "HARD"]),
  scope: z.enum(["NEXT_DATE", "ONGOING"]),
  createdAt: z.string(),
});
export type MemoryCandidate = z.infer<typeof memoryCandidateSchema>;

export const memorySchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  subject: z.enum(["SELF", "PARTNER", "BOTH"]),
  type: z.enum(["CARE", "PREFERENCE", "CONSTRAINT"]),
  content: z.string(),
  sourceType: z.enum([
    "SELF_REPORT",
    "PARTNER_STATEMENT_REPORTED",
    "OBSERVATION",
  ]),
  reflectionId: z.string(),
  answerId: z.string(),
  evidenceQuote: z.string(),
  confirmation: z.literal("USER_CONFIRMED"),
  approvedAt: z.string(),
  visibility: z.literal("PRIVATE"),
  strength: z.enum(["SOFT", "HARD"]),
  scope: z.enum(["NEXT_DATE", "ONGOING"]),
  targetSessionId: z.string().nullable(),
  active: z.boolean(),
  version: z.number().int().positive(),
  supersedes: z.string().nullable(),
});
export type Memory = z.infer<typeof memorySchema>;

export const approvalSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  sessionId: z.string(),
  runId: z.string(),
  planVersionFrom: z.number(),
  planVersionTo: z.number(),
  kind: z.enum(["PLAN_APPLY", "MEMORY_SAVE", "MEMORY_EDIT"]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CONSUMED", "EXPIRED"]),
  summary: z.string(),
  diff: planDiffSchema.nullable(),
  consumedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const runKindSchema = z.enum([
  "INITIAL_PLAN",
  "REPLAN",
  "REFLECTION",
  "NEXT_PLAN",
]);
export type RunKind = z.infer<typeof runKindSchema>;

export const runStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "WAITING_INPUT",
  "WAITING_APPROVAL",
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
  "INTERRUPTED",
  "CANCELLED",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  sessionId: z.string(),
  ownerUid: z.string(),
  kind: runKindSchema,
  status: runStatusSchema,
  mode: modeSchema,
  displayRuntime: z.enum(["MOCK", "LIVE", "REPLAY"]),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: z.string().nullable(),
  heartbeatAt: z.string().nullable(),
  trigger: z.string().nullable(),
  basePlanVersion: z.number().nullable(),
  resultPlanVersion: z.number().nullable(),
  waitingQuestion: z
    .object({
      id: z.string(),
      prompt: z.string(),
      options: z.array(z.string()),
    })
    .nullable(),
  waitingApprovalId: z.string().nullable(),
  error: z.string().nullable(),
  cost: z.object({
    llmJpy: z.number().nullable(),
    apiJpy: z.number().nullable(),
    mundaneCalls: z.number(),
    hardCalls: z.number(),
    unaccountedCalls: z.number(),
  }),
  versions: z.object({
    schema: z.string(),
    prompt: z.string(),
    tool: z.string(),
    modelSettings: z.string(),
    git: z.string().nullable(),
  }),
});
export type Run = z.infer<typeof runSchema>;

export const eventTypeSchema = z.enum([
  "RUN_STARTED",
  "RUN_FINISHED",
  "TOOL_STARTED",
  "TOOL_COMPLETED",
  "CANDIDATE_REJECTED",
  "MODEL_SELECTED",
  "VALIDATION_FAILED",
  "SELF_CORRECTED",
  "INPUT_REQUIRED",
  "APPROVAL_REQUIRED",
  "PLAN_APPLIED",
  "PLAN_AUTO_APPLIED",
  "MEMORY_APPROVED",
  "TIME_BUDGET_REACHED",
  "CACHE_HIT",
  "HTTP_ATTEMPT",
  "SCENARIO_INJECTED",
  "NOTICE",
]);
export type EventType = z.infer<typeof eventTypeSchema>;

export const eventSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  seq: z.number().int().nonnegative(),
  at: z.string(),
  type: eventTypeSchema,
  summary: z.string(),
  evidenceIds: z.array(z.string()),
  model: z.string().nullable(),
  pool: z.enum(["mundane", "hard"]).nullable(),
  requestedModel: z.string().nullable(),
  actualModel: z.string().nullable(),
  usage: z
    .object({
      promptTokens: z.number().nullable(),
      completionTokens: z.number().nullable(),
      costUsd: z.number().nullable(),
      costJpy: z.number().nullable(),
      latencyMs: z.number().nullable(),
      ok: z.boolean(),
    })
    .nullable(),
  payload: z.unknown().nullable(),
});
export type AppEvent = z.infer<typeof eventSchema>;

export const sessionStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "IN_PROGRESS",
  "DONE",
  "REFLECTED",
]);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  ownerUid: z.string(),
  status: sessionStatusSchema,
  input: planningInputSchema,
  currentPlanVersion: z.number().nullable(),
  currentLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
      label: z.string().nullable(),
    })
    .nullable(),
  scheduleNow: z.string().nullable(),
  isDemo: z.boolean(),
  createdAt: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;

export const coupleSchema = z.object({
  id: z.string(),
  ownerUid: z.string(),
  isDemo: z.boolean(),
  createdAt: z.string(),
});
export type Couple = z.infer<typeof coupleSchema>;

export const scenarioKindSchema = z.enum([
  "WEATHER",
  "SPOT_FULL",
  "TRAVEL_DELAY",
  "DEMO_CLOCK",
]);
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

export const scenarioOverlaySchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  kind: scenarioKindSchema,
  createdAt: z.string(),
  createdByUid: z.string(),
  target: z.object({
    spotId: z.string().nullable(),
    legId: z.string().nullable(),
    from: z.string().nullable(),
    to: z.string().nullable(),
  }),
  overlay: z.record(z.string(), z.unknown()),
  baselineRef: z.string().nullable(),
});
export type ScenarioOverlay = z.infer<typeof scenarioOverlaySchema>;

export const replayManifestSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  sessionId: z.string(),
  runId: z.string(),
  createdAt: z.string(),
  gitCommit: z.string().nullable(),
  versions: runSchema.shape.versions,
  events: z.array(eventSchema),
  plan: planSchema.nullable(),
  spots: z.array(spotSchema),
  evidence: z.array(evidenceSchema),
  costSnapshot: runSchema.shape.cost,
  notes: z.string(),
});
export type ReplayManifest = z.infer<typeof replayManifestSchema>;

export const publicPlanDtoSchema = z.object({
  dateTokyo: z.string(),
  meetName: z.string(),
  endName: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      startAt: z.string(),
      endAt: z.string(),
      officialUrl: z.string().nullable(),
    }),
  ),
});
export type PublicPlanDTO = z.infer<typeof publicPlanDtoSchema>;

export const reflectionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  coupleId: z.string(),
  rawNote: z.string(),
  maskedNote: z.string(),
  createdAt: z.string(),
});
export type Reflection = z.infer<typeof reflectionSchema>;
