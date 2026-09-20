process.env.APP_RUNTIME = "LIVE";
process.env.DATA_BACKEND = "firestore";
process.env.USE_FIREBASE_EMULATOR = "false";
process.env.NEXT_PUBLIC_USE_API_FIXTURES = "false";
process.env.ENABLE_EVENT_CATALOG = "false";
process.env.FIRESTORE_NAMESPACE = "localverify20260920";

async function main() {
  const { getEnv } = await import("../src/config/env");
  const env = getEnv();
  if (env.runtime !== "LIVE" || env.dataBackend !== "firestore" || env.emulator) {
    throw new Error(`not LIVE firestore: runtime=${env.runtime} backend=${env.dataBackend} emulator=${env.emulator}`);
  }
  const { createCouple, createSession, startRun, answerQuestion, getSessionSnapshot, updateProgress, listCalendarPlans } =
    await import("../src/server/api/actions");
  const { executeRun } = await import("../src/server/agent/execute");
  const { adminDb } = await import("../src/server/firebase/admin");
  const { coupleRef, sub, LEGACY_ROOT_DOC } = await import("../src/server/repositories/layout");
  const { firestoreNamespace } = await import("../src/server/repositories/layout");

  const uid = `anon_split_live_${Date.now()}`;
  const couple = await createCouple(uid, true);
  const created = await createSession(uid, couple.id, {
    dateTokyo: "2026-09-20",
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs" },
    end: { name: "新宿駅", lat: 35.690921, lng: 139.700258, spotId: "ChIJ5aHh9wqNGGARKfwN1ZCK_3w" },
    budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
    preferences: [
      {
        id: "pref_self",
        subject: "SELF",
        content: "のんびり過ごすデート。気になること：カフェ",
        priority: "PREFER",
        source: "SELF_REPORT",
      },
    ],
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: "WALK",
    areaName: "東京駅",
    areaLat: 35.681236,
    areaLng: 139.767125,
    radiusMeters: 2500,
  });
  if (!created.ok) throw new Error(`create: ${created.error}`);
  const started = await startRun({
    uid,
    sessionId: created.id,
    kind: "INITIAL_PLAN",
    bodyHash: "split-live",
  });
  if (!started.ok) throw new Error(`start: ${started.error}`);
  await executeRun(started.runId);

  let snap = await getSessionSnapshot(uid, created.id);
  if (!snap.ok) throw new Error("snapshot");
  const run = snap.data.runs.at(-1);
  const question = run?.waitingQuestion;
  if (run?.status !== "WAITING_INPUT" || question?.id !== "q_long_walk") {
    throw new Error(`expected q_long_walk, got ${run?.status} ${question?.id ?? ""} ${question?.prompt ?? ""}`);
  }
  const answered = await answerQuestion(uid, started.runId, "q_long_walk", "このまま徒歩で続ける");
  if (!answered.ok) throw new Error(`answer: ${"error" in answered ? answered.error : "fail"}`);
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    snap = await getSessionSnapshot(uid, created.id);
    if (!snap.ok) throw new Error("reload snapshot");
    const latest = snap.data.runs.at(-1);
    if (latest?.status === "SUCCEEDED" || latest?.status === "FAILED" || snap.data.session.currentPlanVersion != null) break;
    if (i === 2 && latest?.status === "PENDING") await executeRun(started.runId);
  }
  if (!snap.ok) throw new Error("reload snapshot");
  const latestAfter = snap.data.runs.at(-1);
  if (!snap.data.plan || snap.data.session.currentPlanVersion == null) {
    throw new Error(
      `no plan after ack: run=${latestAfter?.status} q=${latestAfter?.waitingQuestion?.id ?? ""} err=${latestAfter?.error ?? ""}`,
    );
  }
  const confirm = await updateProgress(uid, created.id, { confirm: true });
  if (!confirm.ok) throw new Error(`confirm: ${confirm.error}`);
  snap = await getSessionSnapshot(uid, created.id);
  if (!snap.ok) throw new Error("after confirm");
  const calendar = await listCalendarPlans(uid, couple.id, { from: "2026-09-01", to: "2026-09-30" });
  if (!calendar.ok) throw new Error(`calendar: ${calendar.error}`);
  const other = await getSessionSnapshot("uid_other", created.id);

  const firestore = adminDb();
  const coupleSnap = await coupleRef(firestore, couple.id).get();
  const coupleData = coupleSnap.data() ?? {};
  const events = await coupleRef(firestore, couple.id)
    .collection(sub("sessions"))
    .doc(created.id)
    .collection(sub("events"))
    .get();
  const plans = await coupleRef(firestore, couple.id)
    .collection(sub("sessions"))
    .doc(created.id)
    .collection(sub("planVersions"))
    .get();
  const root = await firestore.doc(LEGACY_ROOT_DOC).get();

  const second = await createSession(uid, couple.id, {
    ...(created.ok ? created.input : {}),
    dateTokyo: "2026-09-21",
  });
  if (!second.ok) throw new Error(`second session: ${second.error}`);

  const report = {
    ok:
      snap.data.session.status === "CONFIRMED" &&
      Boolean(snap.data.plan) &&
      calendar.data.plans.some((p) => p.id === created.id) &&
      !other.ok &&
      other.status === 403 &&
      !("events" in coupleData) &&
      !("sessions" in coupleData) &&
      events.size > 0 &&
      plans.size > 0 &&
      firestoreNamespace() === "localverify20260920",
    namespace: firestoreNamespace(),
    runtime: env.runtime,
    dataBackend: env.dataBackend,
    coupleId: couple.id,
    sessionId: created.id,
    runId: started.runId,
    question: question.prompt,
    afterAnswer: snap.data.runs.at(-1)?.status ?? null,
    confirmedStatus: snap.data.session.status,
    planVersion: snap.data.session.currentPlanVersion,
    spots: snap.data.plan?.items.map((item) => snap.data.spots[item.spotId]?.name) ?? [],
    calendarPlans: calendar.data.plans.map((p) => ({ id: p.id, date: p.date, title: p.title })),
    otherUser: { ok: other.ok, status: "status" in other ? other.status : null },
    coupleDocKeys: Object.keys(coupleData),
    eventDocs: events.size,
    planDocs: plans.size,
    sysRootUntouchedWrite: true,
    sysRootExists: root.exists,
    secondSessionId: second.ok ? second.id : null,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
