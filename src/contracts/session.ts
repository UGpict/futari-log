import { z } from "zod";
import { planningInputSchema } from "./planning";

export const runKindSchema = z.enum(["INITIAL_PLAN", "REPLAN", "REFLECTION", "NEXT_PLAN"]);
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

export const startRunRequestSchema = z.object({
  kind: runKindSchema.optional(),
  trigger: z.string().optional(),
});
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const startRunResponseSchema = z.object({
  runId: z.string(),
});
export type StartRunResponse = z.infer<typeof startRunResponseSchema>;

export const costSchema = z.object({
  llmJpy: z.number().nullable(),
  apiJpy: z.number().nullable(),
  mundaneCalls: z.number(),
  hardCalls: z.number(),
  unaccountedCalls: z.number(),
});
export type CostSnapshot = z.infer<typeof costSchema>;

export const waitingQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.string()),
});
export type WaitingQuestion = z.infer<typeof waitingQuestionSchema>;

export const runDtoSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  sessionId: z.string(),
  ownerUid: z.string(),
  kind: runKindSchema,
  status: runStatusSchema,
  mode: z.string(),
  displayRuntime: z.string(),
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
  waitingQuestion: waitingQuestionSchema.nullable(),
  waitingApprovalId: z.string().nullable(),
  error: z.string().nullable(),
  cost: costSchema,
  versions: z.object({
    schema: z.string(),
    prompt: z.string(),
    tool: z.string(),
    modelSettings: z.string(),
    git: z.string().nullable(),
  }),
});
export type RunDto = z.infer<typeof runDtoSchema>;

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

export const progressEventSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  seq: z.number(),
  at: z.string(),
  type: z.string(),
  summary: z.string(),
  evidenceIds: z.array(z.string()).optional(),
  model: z.string().nullable().optional(),
  pool: z.string().nullable().optional(),
  requestedModel: z.string().nullable().optional(),
  actualModel: z.string().nullable().optional(),
  usage: z
    .object({
      promptTokens: z.number().nullable(),
      completionTokens: z.number().nullable(),
      costUsd: z.number().nullable(),
      costJpy: z.number().nullable(),
      latencyMs: z.number().nullable(),
      ok: z.boolean(),
    })
    .nullable()
    .optional(),
  payload: z.unknown().nullable().optional(),
});
export type ProgressEvent = z.infer<typeof progressEventSchema>;

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

export const approvalDtoSchema = z.object({
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
export type ApprovalDto = z.infer<typeof approvalDtoSchema>;

export const approvalDecisionRequestSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
});
export type ApprovalDecisionRequest = z.infer<typeof approvalDecisionRequestSchema>;

export const validationIssueDtoSchema = z.object({
  code: z.string(),
  severity: z.enum(["ERROR", "UNKNOWN", "WARNING"]),
  itemIds: z.array(z.string()),
  message: z.string(),
  evidenceIds: z.array(z.string()),
});

export const planItemDtoSchema = z.object({
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

export const spotDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  categories: z.array(z.string()),
  environment: z.object({ value: z.string().nullable(), evidenceIds: z.array(z.string()) }),
  costForTwoJpy: z.object({
    value: z.object({ min: z.number(), max: z.number() }).nullable(),
    evidenceIds: z.array(z.string()),
  }),
  restEase: z.object({ value: z.string().nullable(), evidenceIds: z.array(z.string()) }).optional(),
  standingBurden: z.object({ value: z.string().nullable(), evidenceIds: z.array(z.string()) }).optional(),
  officialUrl: z.string().nullable(),
  imageUrl: z.string().nullable().optional(),
  imageSourceUrl: z.string().nullable().optional(),
  imageProvider: z.string().nullable().optional(),
  imageAttributions: z
    .array(z.object({ displayName: z.string(), uri: z.string().nullable() }))
    .optional(),
});
export type SpotDto = z.infer<typeof spotDtoSchema>;

export const planDtoSchema = z.object({
  version: z.number(),
  items: z.array(planItemDtoSchema),
  legs: z.array(z.unknown()),
  openings: z.array(z.unknown()).optional(),
  assumptions: z.array(z.string()),
  validation: z.object({
    state: z.enum(["PASS", "CONDITIONAL", "FAIL"]),
    issues: z.array(validationIssueDtoSchema),
  }),
  planB: z.array(
    z.object({
      id: z.string(),
      trigger: z.string(),
      itemId: z.string().optional(),
      candidateSpotId: z.string().nullable(),
      policy: z.string().nullable(),
      isVerifiedAlternative: z.boolean(),
    }),
  ),
  costEstimate: z.object({
    totalJpy: z.object({ value: z.number().nullable() }).optional(),
  }).passthrough(),
  dataMode: z.string(),
  memoryInfluences: z.array(
    z.object({
      memoryId: z.string(),
      effect: z.string(),
      detail: z.string(),
    }),
  ),
});
export type PlanDto = z.infer<typeof planDtoSchema>;

export const sessionDtoSchema = z.object({
  id: z.string(),
  coupleId: z.string(),
  ownerUid: z.string(),
  status: z.string(),
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
export type SessionDto = z.infer<typeof sessionDtoSchema>;

export const coupleDtoSchema = z.object({
  id: z.string(),
  ownerUid: z.string(),
  isDemo: z.boolean(),
  createdAt: z.string(),
});
export type CoupleDto = z.infer<typeof coupleDtoSchema>;

export const scenarioKindSchema = z.enum(["WEATHER", "SPOT_FULL", "TRAVEL_DELAY", "DEMO_CLOCK"]);
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

export const injectScenarioRequestSchema = z.object({
  kind: scenarioKindSchema,
  spotId: z.string().nullable().optional(),
  legId: z.string().nullable().optional(),
  from: z.string().nullable().optional(),
  to: z.string().nullable().optional(),
  overlay: z.record(z.string(), z.unknown()).optional(),
});
export type InjectScenarioRequest = z.infer<typeof injectScenarioRequestSchema>;

export const injectScenarioResponseSchema = z.object({
  scenarioId: z.string(),
  runId: z.string(),
});
export type InjectScenarioResponse = z.infer<typeof injectScenarioResponseSchema>;

export const progressRequestSchema = z.object({
  confirm: z.boolean().optional(),
  status: z.string().optional(),
  itemId: z.string().optional(),
  progress: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE"]).optional(),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      label: z.string().optional(),
    })
    .optional(),
});
export type ProgressRequest = z.infer<typeof progressRequestSchema>;

export const answerRequestSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().min(1),
});
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

export const sessionSnapshotSchema = z.object({
  runtime: z.string(),
  emulator: z.boolean().optional(),
  dataBackend: z.string().optional(),
  authBackend: z.string().optional(),
  blockers: z.array(z.object({ code: z.string(), item: z.string(), status: z.string().optional() })).optional(),
  couple: coupleDtoSchema,
  session: sessionDtoSchema,
  plan: planDtoSchema.nullable(),
  spots: z.record(z.string(), spotDtoSchema),
  evidence: z.record(z.string(), z.unknown()).optional(),
  runs: z.array(runDtoSchema),
  events: z.array(progressEventSchema),
  approvals: z.array(approvalDtoSchema),
  memories: z.array(z.unknown()),
  memoryCandidates: z.array(z.unknown()),
  scenarios: z.array(z.unknown()).optional(),
  overlays: z.array(z.string()),
  grounding: z
    .object({
      queries: z.array(z.string()),
      searchEntryPointHtml: z.string().nullable(),
    })
    .nullable()
    .optional(),
});
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;

export const runViewSchema = z.object({
  ok: z.literal(true).optional(),
  run: runDtoSchema,
  events: z.array(progressEventSchema),
});
export type RunView = z.infer<typeof runViewSchema>;

export const messageDraftResponseSchema = z.object({
  ok: z.literal(true).optional(),
  text: z.string().nullable(),
  blocked: z.boolean(),
});
export type MessageDraftResponse = z.infer<typeof messageDraftResponseSchema>;
