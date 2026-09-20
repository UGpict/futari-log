import type { MeResponse, SessionSnapshot } from "@/contracts";

export function fixturesEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_API_FIXTURES !== "true") return false;
  if (process.env.NEXT_PUBLIC_APP_RUNTIME === "LIVE") return false;
  return true;
}

const now = "2026-09-19T13:00:00+09:00";

function cost() {
  return { llmJpy: 1, apiJpy: null, mundaneCalls: 0, hardCalls: 1, unaccountedCalls: 0 };
}

function versions() {
  return { schema: "0.5.0", prompt: "0.5.0", tool: "0.5.0", modelSettings: "0.5.0", git: "fixture" };
}

function baseSpot(id: string, name: string, extra: { officialUrl?: string | null } = {}) {
  return {
    id,
    name,
    lat: 35.17,
    lng: 136.88,
    categories: ["cafe"],
    environment: { value: "INDOOR" as const, evidenceIds: [] },
    costForTwoJpy: { value: { min: 2000, max: 3000 }, evidenceIds: [] },
    restEase: { value: "EASY", evidenceIds: [] },
    standingBurden: { value: "LOW", evidenceIds: [] },
    officialUrl: extra.officialUrl ?? null,
  };
}

function planItems() {
  return [
    {
      id: "it_1",
      spotId: "ChIJ_noritake",
      startAt: "2026-09-19T13:20:00+09:00",
      endAt: "2026-09-19T14:10:00+09:00",
      progress: "NOT_STARTED" as const,
      locked: false,
      lockReason: null,
      matchesPreferenceIds: ["pref_self"],
      memoryIds: [],
      reason: "屋外と展示のあいだで歩ける",
      evidenceIds: [],
    },
    {
      id: "it_lock",
      spotId: "mock:aichi-art-museum",
      startAt: "2026-09-19T15:00:00+09:00",
      endAt: "2026-09-19T16:00:00+09:00",
      progress: "NOT_STARTED" as const,
      locked: true,
      lockReason: "時刻固定",
      matchesPreferenceIds: ["pref_self"],
      memoryIds: [],
      reason: "予約枠として時刻固定",
      evidenceIds: [],
    },
    {
      id: "it_3",
      spotId: "ChIJ_herbs",
      startAt: "2026-09-19T16:20:00+09:00",
      endAt: "2026-09-19T17:10:00+09:00",
      progress: "NOT_STARTED" as const,
      locked: false,
      lockReason: null,
      matchesPreferenceIds: ["pref_partner"],
      memoryIds: [],
      reason: "甘いものの希望",
      evidenceIds: [],
    },
  ];
}

function sessionInput() {
  return {
    dateTokyo: "2026-09-19",
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "名古屋駅", lat: 35.170915, lng: 136.881537, spotId: "mock:nagoya-station" },
    end: { name: "名古屋駅", lat: 35.170915, lng: 136.881537, spotId: "mock:nagoya-station" },
    budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    preferences: [
      {
        id: "pref_self",
        subject: "SELF" as const,
        content: "散歩と展示",
        priority: "PREFER" as const,
        source: "SELF_REPORT" as const,
      },
      {
        id: "pref_partner",
        subject: "PARTNER" as const,
        content: "甘いもの",
        priority: "MUST" as const,
        source: "PARTNER_STATEMENT_REPORTED" as const,
      },
    ],
    fixedAppointments: [
      {
        id: "fix_art",
        label: "愛知県美術館",
        spotId: "mock:aichi-art-museum",
        spotNameHint: "愛知県美術館",
        startAt: "2026-09-19T15:00:00+09:00",
        endAt: "2026-09-19T16:00:00+09:00",
        kind: "TIME_FIXED" as const,
      },
    ],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: "WALK" as const,
    areaName: "名古屋駅周辺",
    areaLat: 35.170915,
    areaLng: 136.881537,
    radiusMeters: 2500,
  };
}

function baseSnapshot(id: string, overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  const couple = {
    id: "cpl_fixture",
    ownerUid: "uid_fixture",
    isDemo: true,
    createdAt: now,
  };
  const session = {
    id,
    coupleId: couple.id,
    ownerUid: couple.ownerUid,
    status: "DRAFT",
    input: sessionInput(),
    currentPlanVersion: 1,
    currentLocation: null,
    scheduleNow: null,
    isDemo: true,
    createdAt: now,
  };
  const snap: SessionSnapshot = {
    runtime: "MOCK",
    emulator: false,
    dataBackend: "file",
    authBackend: "mock",
    blockers: [],
    couple,
    session,
    plan: {
      version: 1,
      items: planItems(),
      legs: [],
      openings: [],
      assumptions: ["空席は確認していない"],
      validation: { state: "CONDITIONAL", issues: [] },
      planB: [],
      costEstimate: { totalJpy: { value: null } },
      dataMode: "LIVE",
      memoryInfluences: [],
    },
    spots: {
      ChIJ_noritake: baseSpot("ChIJ_noritake", "ノリタケの森"),
      "mock:aichi-art-museum": baseSpot("mock:aichi-art-museum", "愛知県美術館"),
      ChIJ_herbs: baseSpot("ChIJ_herbs", "ハーブス 栄本店", {
        officialUrl: "https://example.com/herbs",
      }),
    },
    evidence: {},
    runs: [
      {
        id: "run_fx",
        coupleId: couple.id,
        sessionId: id,
        ownerUid: couple.ownerUid,
        kind: "INITIAL_PLAN",
        status: "SUCCEEDED",
        mode: "LIVE",
        displayRuntime: "MOCK",
        createdAt: now,
        startedAt: now,
        finishedAt: now,
        deadlineAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        heartbeatAt: null,
        trigger: null,
        basePlanVersion: null,
        resultPlanVersion: 1,
        waitingQuestion: null,
        waitingApprovalId: null,
        error: null,
        cost: cost(),
        versions: versions(),
      },
    ],
    events: [
      {
        eventId: "evt_1",
        runId: "run_fx",
        seq: 0,
        at: now,
        type: "RUN_STARTED",
        summary: "INITIAL_PLAN を開始",
        actualModel: null,
        pool: null,
      },
      {
        eventId: "evt_2",
        runId: "run_fx",
        seq: 1,
        at: now,
        type: "MODEL_SELECTED",
        summary: "hard / gpt-4o-2024-08-06",
        actualModel: "gpt-4o-2024-08-06",
        pool: "hard",
      },
      {
        eventId: "evt_3",
        runId: "run_fx",
        seq: 2,
        at: now,
        type: "RUN_FINISHED",
        summary: "完了",
        actualModel: null,
        pool: null,
      },
    ],
    approvals: [],
    memories: [],
    memoryCandidates: [],
    scenarios: [],
    overlays: [],
  };
  return { ...snap, ...overrides, session: { ...snap.session, ...(overrides.session ?? {}) } };
}

export const fixtureMe: MeResponse = {
  uid: "uid_fixture",
  coupleId: "cpl_fixture",
  runtime: "MOCK",
  authBackend: "mock",
  dataBackend: "file",
  emulator: false,
  demoControls: true,
  demoAreaName: "名古屋駅周辺",
  demoDate: "2026-09-19",
  demoLat: 35.170915,
  demoLng: 136.881537,
  blockers: [{ code: "VENUE", item: "東京の発表会場住所・最寄り駅は未提供。開発時は名古屋駅周辺を明示使用" }],
};

export const fixtureSuccess = baseSnapshot("fx-success");

export const fixtureFailed = baseSnapshot("fx-failed", {
  plan: {
    ...fixtureSuccess.plan!,
    validation: {
      state: "FAIL",
      issues: [
        {
          code: "FIXED_MISSING",
          severity: "ERROR",
          itemIds: [],
          message: "時刻固定の予定「愛知県美術館」が行程にありません",
          evidenceIds: [],
        },
      ],
    },
  },
  runs: [
    {
      ...fixtureSuccess.runs[0],
      status: "FAILED",
      error: "validation FAIL",
    },
  ],
});

export const fixtureApproval = baseSnapshot("fx-approval", {
  runs: [
    {
      ...fixtureSuccess.runs[0],
      kind: "REPLAN",
      status: "WAITING_APPROVAL",
      waitingApprovalId: "appr_fx",
      resultPlanVersion: 2,
    },
  ],
  approvals: [
    {
      id: "appr_fx",
      coupleId: "cpl_fixture",
      sessionId: "fx-approval",
      runId: "run_fx",
      planVersionFrom: 1,
      planVersionTo: 2,
      kind: "PLAN_APPLY",
      status: "PENDING",
      summary: "雨のため屋外を屋内へ差し替え",
      diff: {
        fromVersion: 1,
        toVersion: 2,
        keptItemIds: ["it_lock"],
        replaced: [
          {
            fromItemId: "it_1",
            toItemId: "it_new",
            fromSpotId: "ChIJ_noritake",
            toSpotId: "ChIJ_museum",
          },
        ],
        addedItemIds: [],
        removedItemIds: [],
        timeShifts: [],
        summary: "ノリタケの森 → 名古屋市美術館",
      },
      consumedAt: null,
      createdAt: now,
    },
  ],
  overlays: ["WEATHER"],
});

export const fixtureReplan = baseSnapshot("fx-replan", {
  events: [
    ...fixtureSuccess.events,
    {
      eventId: "evt_auto",
      runId: "run_fx",
      seq: 3,
      at: now,
      type: "PLAN_AUTO_APPLIED",
      summary: "AUTO_NOTIFY: 1件差し替え",
      actualModel: null,
      pool: null,
    },
  ],
  overlays: ["WEATHER"],
  plan: {
    ...fixtureSuccess.plan!,
    version: 2,
    memoryInfluences: [
      { memoryId: "mem_fx", effect: "DURATION", detail: "滞在を短くした" },
    ],
  },
  session: {
    ...baseSnapshot("fx-replan").session,
    currentPlanVersion: 2,
  },
});

export function snapshotFor(id: string): SessionSnapshot | null {
  if (id === "fx-success") return fixtureSuccess;
  if (id === "fx-failed") return fixtureFailed;
  if (id === "fx-approval") return fixtureApproval;
  if (id === "fx-replan") return fixtureReplan;
  if (id === "fx-loading") return null;
  return fixtureSuccess;
}
