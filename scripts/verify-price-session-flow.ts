/**
 * End-to-end: plan a session near Kiyosumi, wait for PRICE_ENRICH, re-fetch snapshot costs.
 *
 *   npx tsx scripts/verify-price-session-flow.ts
 *
 * Uses file backend only (never production Firestore).
 */
export {};

process.env.DATA_BACKEND = "file";
process.env.USE_FIREBASE_EMULATOR = "false";
process.env.ENABLE_DEMO_CONTROLS = "true";
process.env.APP_RUNTIME = "LIVE";
process.env.NEXT_PUBLIC_USE_API_FIXTURES = "false";
// Clear cached env if a prior import warmed it (fresh process is normal for this script).
delete (globalThis as { __futariEnvLoaded?: boolean }).__futariEnvLoaded;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const { getEnv } = await import("../src/config/env");
  const { createCouple, createSession, getSessionSnapshot } = await import("../src/server/api/actions");
  const { insertPendingRun, getSession } = await import("../src/server/repositories/store");
  const { executeRun } = await import("../src/server/agent/execute");
  const { searchPlacesByText } = await import("../src/server/providers");
  const { tokyoToday } = await import("../src/config/public");
  const { spotCostLabel } = await import("../src/features/session/cost-label");

  const env = getEnv();
  if (env.dataBackend !== "file") {
    console.log(JSON.stringify({ stopped: true, reason: "refusing non-file backend" }));
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      runtime: env.runtime,
      dataBackend: env.dataBackend,
      hasOrca: Boolean(env.orcaApiKey),
      hasMaps: Boolean(env.googleMapsApiKey),
    }),
  );

  const couple = await createCouple("verify-price-uid", true);
  const uid = "verify-price-uid";

  // Prefer real Places when Maps is available; otherwise use known Place IDs + websiteUri via catalog-ish flow.
  let meet = {
    name: "清澄白河駅",
    lat: 35.6821,
    lng: 139.8001,
    spotId: "ChIJYXjHTQCJGGARnZy1AU66hSw" as string | null,
  };
  let end = { ...meet };

  if (env.googleMapsApiKey) {
    const found = await searchPlacesByText({ query: "清澄白河駅", lat: 35.6821, lng: 139.8001 });
    const station = found.places?.[0];
    if (station?.id) {
      meet = {
        name: station.name ?? "清澄白河駅",
        lat: station.lat ?? 35.6821,
        lng: station.lng ?? 139.8001,
        spotId: station.id,
      };
      end = { ...meet };
    }
  }

  const dateTokyo = tokyoToday();
  const created = await createSession(uid, couple.id, {
    dateTokyo,
    startTime: "13:00",
    endTime: "18:00",
    meet,
    end,
    budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    preferences: [
      {
        id: "pref_museum",
        subject: "SELF",
        content: "美術館か庭園",
        priority: "MUST",
        source: "SELF_REPORT",
      },
      {
        id: "pref_food",
        subject: "PARTNER",
        content: "居酒屋かカフェ",
        priority: "PREFER",
        source: "PARTNER_STATEMENT_REPORTED",
      },
    ],
    fixedAppointments: [],
    autoApply: {
      enabled: true,
      acknowledgedScope: "未着手1件 PASS 予算増なし 終了遅延なし 移動増なし",
      validUntil: "2099-01-01T00:00:00.000Z",
    },
    travelMode: "WALK",
    areaName: "清澄白河",
    areaLat: meet.lat,
    areaLng: meet.lng,
    radiusMeters: 1500,
  });
  if (!created.ok) {
    console.log(JSON.stringify({ createSessionFailed: created }));
    process.exit(1);
  }
  const sessionId = created.id;

  const pending = await insertPendingRun({
    uid,
    sessionId,
    kind: "INITIAL_PLAN",
    trigger: "verify_price_session_flow",
    instruction: null,
    idempotencyKey: `verify-price-plan:${sessionId}`,
    bodyHash: "verify-price",
  });
  if (!pending.ok) {
    console.log(JSON.stringify({ planEnqueueFailed: pending }));
    process.exit(1);
  }

  console.log(JSON.stringify({ sessionId, planRunId: pending.runId, phase: "planning" }));
  await executeRun(pending.runId);

  // Answer waiting questions if planner needs Tokyo / range ack.
  for (let i = 0; i < 6; i++) {
    const found = await getSession(sessionId);
    const runs = Object.values(found?.bundle.runs ?? {});
    const waiting = runs.find((r) => r.status === "WAITING_INPUT" && r.waitingQuestion);
    if (!waiting?.waitingQuestion) break;
    const qid = waiting.waitingQuestion.id;
    const { answerQuestion } = await import("../src/server/api/actions");
    const answer =
      qid === "q_tokyo_unconfirmed"
        ? "都内の場所です"
        : qid === "q_search_range"
          ? "この範囲で続ける"
          : qid === "q_unsupported_wish"
            ? "対応できる範囲で続ける"
            : typeof waiting.waitingQuestion.options?.[0] === "string"
              ? waiting.waitingQuestion.options[0]
              : (waiting.waitingQuestion.options?.[0] as { label?: string } | undefined)?.label ??
                "続ける";
    console.log(JSON.stringify({ phase: "answer", qid, answer }));
    const res = await answerQuestion(uid, waiting.id, qid, answer);
    if (res.ok && "restart" in res && res.restart) {
      const next = await insertPendingRun({
        uid,
        sessionId,
        kind: "INITIAL_PLAN",
        trigger: `verify_price_restart_${i}`,
        instruction: null,
        idempotencyKey: `verify-price-plan:${sessionId}:r${i}`,
        bodyHash: `verify-price-r${i}`,
      });
      if (next.ok) await executeRun(next.runId);
    }
  }

  const afterPlan = await getSession(sessionId);
  const planVersion = afterPlan?.bundle.session.currentPlanVersion;
  const plan = planVersion ? afterPlan?.bundle.planHistory[String(planVersion)] : null;
  const spotNames =
    plan?.items.map((it) => afterPlan?.bundle.spots[it.spotId]?.name ?? it.spotId) ?? [];
  console.log(
    JSON.stringify({
      phase: "planned",
      status: afterPlan?.bundle.session.status,
      validation: plan?.validation?.state,
      items: spotNames,
      runs: Object.values(afterPlan?.bundle.runs ?? {}).map((r) => ({
        kind: r.kind,
        status: r.status,
        id: r.id,
      })),
    }),
  );

  // Wait for PRICE_ENRICH background runs (kickRun is fire-and-forget).
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const found = await getSession(sessionId);
    const enrichRuns = Object.values(found?.bundle.runs ?? {}).filter((r) => r.kind === "PRICE_ENRICH");
    const pendingEnrich = enrichRuns.filter((r) =>
      ["PENDING", "RUNNING", "QUEUED"].includes(r.status),
    );
    const done = enrichRuns.filter((r) =>
      ["SUCCEEDED", "FAILED", "PARTIAL", "SKIPPED_DUPLICATE"].includes(r.status),
    );
    if (enrichRuns.length > 0 && pendingEnrich.length === 0) {
      console.log(
        JSON.stringify({
          phase: "enrich_done",
          enrichRuns: enrichRuns.map((r) => ({
            id: r.id,
            status: r.status,
            trigger: r.trigger,
            error: r.error,
          })),
        }),
      );
      break;
    }
    if (enrichRuns.length === 0 && Date.now() > deadline - 60_000) {
      // No enrich enqueued — still check snapshot (may already have prices).
      console.log(JSON.stringify({ phase: "no_enrich_runs_yet", waitedMs: 180_000 - (deadline - Date.now()) }));
      break;
    }
    await sleep(2000);
  }

  // One more tick: execute any still-pending PRICE_ENRICH ourselves.
  const again = await getSession(sessionId);
  for (const run of Object.values(again?.bundle.runs ?? {})) {
    if (run.kind === "PRICE_ENRICH" && ["PENDING", "RUNNING"].includes(run.status)) {
      await executeRun(run.id);
    }
  }

  const snap = await getSessionSnapshot(uid, sessionId);
  if (!snap.ok) {
    console.log(JSON.stringify({ snapshotFailed: snap }));
    process.exit(1);
  }
  const spotsRecord = (snap.data.spots ?? {}) as Record<
    string,
    {
      id: string;
      name: string;
      categories?: string[];
      officialUrl?: string | null;
      costAccounting?: {
        status: string;
        assumptionLabel: string | null;
        amountMinJpy: number | null;
        amountMaxJpy: number | null;
        note: string | null;
        maxInclusive?: boolean;
      } | null;
      costForTwoJpy?: { value: { min: number; max: number } | null };
      placesPriceBand?: unknown;
    }
  >;
  const spots = Object.values(spotsRecord);
  const planItems = (snap.data.plan?.items ?? []) as Array<{ spotId: string }>;
  const planSpotIds = new Set(planItems.map((i) => i.spotId));
  const rows = spots
    .filter((s) => planSpotIds.has(s.id))
    .map((s) => ({
      name: s.name,
      id: s.id,
      categories: s.categories ?? [],
      officialUrl: s.officialUrl ?? null,
      label: spotCostLabel(s as never),
      accounting: s.costAccounting
        ? {
            status: s.costAccounting.status,
            assumptionLabel: s.costAccounting.assumptionLabel,
            amountMinJpy: s.costAccounting.amountMinJpy,
            amountMaxJpy: s.costAccounting.amountMaxJpy,
          }
        : null,
      costForTwoJpy: s.costForTwoJpy?.value ?? null,
    }));

  const withPrice = rows.filter(
    (r) =>
      r.accounting &&
      r.accounting.status !== "UNKNOWN" &&
      r.accounting.amountMinJpy != null,
  );
  console.log(
    JSON.stringify(
      {
        phase: "snapshot",
        sessionStatus: snap.data.session?.status,
        spotCount: rows.length,
        pricedCount: withPrice.length,
        spots: rows,
        ok: withPrice.length > 0,
      },
      null,
      2,
    ),
  );

  process.exit(withPrice.length > 0 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
