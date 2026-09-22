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
  /** Places の単位不明価格帯。二人料金には使わない。 */
  placesPriceBand: z
    .object({
      minJpy: z.number().nullable(),
      maxJpy: z.number().nullable(),
      maxInclusive: z.boolean(),
      unitUnknown: z.literal(true),
      source: z.literal("places.priceRange"),
    })
    .nullable()
    .optional(),
  /** 収集済み公式単価からの会計（CALCULATED / ESTIMATED / UNKNOWN）。 */
  costAccounting: z
    .object({
      status: z.enum(["CALCULATED", "ESTIMATED", "UNKNOWN"]),
      assumptionLabel: z.string().nullable(),
      amountMinJpy: z.number().nullable(),
      amountMaxJpy: z.number().nullable(),
      maxInclusive: z.boolean(),
      breakdown: z.array(
        z.object({
          label: z.string(),
          amountJpy: z.number().nullable(),
          factId: z.string().nullable(),
        }),
      ),
      sourceUrl: z.string().nullable(),
      confirmedAt: z.string().nullable(),
      note: z.string().nullable(),
      knownSubtotalJpy: z.number().nullable(),
      unknownLabels: z.array(z.string()),
    })
    .nullable()
    .optional(),
  restEase: factSchema(restEaseSchema),
  standingBurden: factSchema(standingBurdenSchema),
  officialUrl: z.string().nullable(),
  spotKind: z.enum(["VENUE", "EVENT"]).optional(),
  catalogEventId: z.string().nullable().optional(),
  catalogVenueId: z.string().nullable().optional(),
  eventWindow: z
    .object({
      startAt: z.string().nullable(),
      endAt: z.string().nullable(),
      confirmation: z.enum(["VERIFIED", "PARTIAL", "UNKNOWN"]),
      evidenceIds: z.array(z.string()),
    })
    .nullable()
    .optional(),
  eventHours: z
    .object({
      open: z.string().nullable(),
      close: z.string().nullable(),
      fridayClose: z.string().nullable(),
      confirmation: z.enum(["VERIFIED", "PARTIAL", "UNKNOWN"]),
      evidenceIds: z.array(z.string()),
    })
    .nullable()
    .optional(),
  eventClosed: z
    .object({
      weekdays: z.array(z.number()),
      exceptionOpen: z.array(z.string()),
      extraClosed: z.array(z.string()),
      confirmation: z.enum(["VERIFIED", "PARTIAL", "UNKNOWN"]),
      evidenceIds: z.array(z.string()),
    })
    .nullable()
    .optional(),
  imageUrl: z.string().nullable().optional(),
  imageSourceUrl: z.string().nullable().optional(),
  imageProvider: z.string().nullable().optional(),
  imageAttributions: z
    .array(z.object({ displayName: z.string(), uri: z.string().nullable() }))
    .optional(),
  photoName: z.string().nullable().optional(),
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
  /**
   * TRANSIT 区間のうち徒歩部分（駅まで・乗換・駅から）。
   * value null = 内訳未取得（0分扱いにしない）。WALK 区間では通常省略し duration 全体が徒歩。
   */
  walkMinutesWithin: factSchema(z.number()).optional(),
  bufferMinutes: z.number().optional(),
  cachedAt: z.string().nullable().optional(),
  requestedDepartureAt: z.string().nullable().optional(),
  effectiveDepartureAt: z.string().nullable().optional(),
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

/** 決定論プランが読む構造化方針。曖昧な観察から HARD 数値を自動生成しない。 */
export const memoryPlanDirectiveSchema = z.object({
  kind: z.enum([
    "PREFER_SEATED_REST",
    "SHORTEN_CATEGORY_STAY",
    "REVISIT_SPOT",
    "PREFER_NEW_SPOTS",
    "WALK_HARD_CAP",
  ]),
  categories: z.array(z.string()).default([]),
  spotId: z.string().nullable().default(null),
  /** SHORTEN 用。ユーザーが明示したときだけ。根拠のない上限は作らない。 */
  maxStayMinutes: z.number().int().positive().nullable().default(null),
  /** WALK_HARD_CAP かつ strength=HARD のときだけ強制。 */
  walkHardCapMinutes: z.number().int().positive().nullable().default(null),
});
export type MemoryPlanDirective = z.infer<typeof memoryPlanDirectiveSchema>;

export const memoryCandidateSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  sessionId: z.string(),
  reflectionId: z.string(),
  reflectionVersion: z.number().int().positive().default(1),
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
  planDirectives: z.array(memoryPlanDirectiveSchema).default([]),
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
  reflectionVersion: z.number().int().positive().default(1),
  answerId: z.string(),
  evidenceQuote: z.string(),
  confirmation: z.literal("USER_CONFIRMED"),
  approvedAt: z.string(),
  visibility: z.literal("PRIVATE"),
  strength: z.enum(["SOFT", "HARD"]),
  scope: z.enum(["NEXT_DATE", "ONGOING"]),
  targetSessionId: z.string().nullable(),
  planDirectives: z.array(memoryPlanDirectiveSchema).default([]),
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
  /** MEMORY_SAVE の対象。文章一致ではなく ID で承認する。 */
  targetCandidateId: z.string().nullable().optional(),
  /** MEMORY_EDIT の対象。 */
  targetMemoryId: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive().nullable().optional(),
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
  "PRICE_ENRICH",
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
  instruction: z.string().nullable().optional(),
  targetPlanItemId: z.string().nullable().optional(),
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
  /** 振り返り分析ジョブの対象。 */
  reflectionId: z.string().nullable().optional(),
  reflectionContentVersion: z.number().int().positive().nullable().optional(),
  error: z.string().nullable(),
  cost: z.object({
    llmUsd: z.number().nullable().optional(),
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
      retries: z.number().int().nonnegative().optional(),
      lastStatus: z.number().int().nullable().optional(),
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

export const walkLongAckSchema = z.object({
  fingerprint: z.string(),
  at: z.string(),
  dateTokyo: z.string().optional(),
  travelMode: z.string().optional(),
  meetSpotId: z.string().nullable().optional(),
  endSpotId: z.string().nullable().optional(),
  routeSpotIds: z.array(z.string()).optional(),
  longestLegMinutes: z.number().optional(),
  totalMinutes: z.number().optional(),
  /** 承認した長距離徒歩区間（別区間が追加されたら再評価） */
  acknowledgedLongLegs: z
    .array(
      z.object({
        key: z.string(),
        minutes: z.number(),
      }),
    )
    .optional(),
});
export type WalkLongAck = z.infer<typeof walkLongAckSchema>;

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
  walkLongAck: walkLongAckSchema.nullable().optional(),
  pendingWalkAckFingerprint: z.string().nullable().optional(),
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

export const reflectionVisitSchema = z.object({
  planItemId: z.string(),
  spotId: z.string(),
  visited: z.boolean(),
  rating: z.enum(["good", "ok", "bad"]).nullable().default(null),
  note: z.string().nullable().default(null),
});
export type ReflectionVisit = z.infer<typeof reflectionVisitSchema>;

export const reflectionAnalysisStatusSchema = z.enum([
  "IDLE",
  "PENDING",
  "WAITING_INPUT",
  "SUCCEEDED",
  "FAILED",
]);
export type ReflectionAnalysisStatus = z.infer<typeof reflectionAnalysisStatusSchema>;

export const reflectionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  coupleId: z.string(),
  planVersion: z.number().int().positive().nullable().default(null),
  dateTokyo: z.string().nullable().default(null),
  title: z.string().default(""),
  /** 相手の様子についてのユーザー観察。パートナー感情の確定ではない。 */
  mood: z.enum(["happy", "relaxed", "tired", "sad"]).nullable().default(null),
  rawNote: z.string(),
  maskedNote: z.string(),
  visits: z.array(reflectionVisitSchema).default([]),
  contentVersion: z.number().int().positive().default(1),
  analysisStatus: reflectionAnalysisStatusSchema.default("IDLE"),
  analysisRunId: z.string().nullable().default(null),
  analysisError: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string().nullable().default(null),
});
export type Reflection = z.infer<typeof reflectionSchema>;
