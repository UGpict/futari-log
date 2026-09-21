import { createCouple, createSession, startRun, answerQuestion, updateProgress } from "../src/server/api/actions";
import { executeRun } from "../src/server/agent/execute";
import { getRun, getSession } from "../src/server/repositories/store";
import { sha256 } from "../src/lib/ids";
import { getEnv } from "../src/config/env";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

async function main() {
  const uid = "anon_mock_walk";
  const env = getEnv();
  const couple = await createCouple(uid, true);
  const session = await createSession(uid, couple.id, {
    dateTokyo: "2026-09-21",
    startTime: "13:00",
    endTime: "18:00",
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
    fixedAppointments: [],
    autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
    travelMode: "WALK",
    areaName: "東京駅周辺",
    areaLat: 35.681236,
    areaLng: 139.767125,
    radiusMeters: 1500,
    tokyoAreaAcknowledged: true,
  });
  if (!session.ok) throw new Error(session.error);
  const started = await startRun({
    uid,
    sessionId: session.id,
    kind: "INITIAL_PLAN",
    trigger: "mock-walk",
    bodyHash: sha256("mock-walk-" + Date.now()),
  });
  if (!started.ok) throw new Error(started.error);
  await executeRun(started.runId);
  let found = await getRun(started.runId);
  const q1 = found?.run.waitingQuestion ?? null;
  let after: Record<string, unknown> | null = null;
  if (found?.run.status === "WAITING_INPUT" && q1?.id === "q_long_walk") {
    const ans = await answerQuestion(uid, found.run.id, "q_long_walk", "公共交通を使う");
    if (!ans.ok) throw new Error(ans.error);
    await executeRun(found.run.id);
    found = await getRun(found.run.id);
    const version = found?.bundle.session.currentPlanVersion;
    const plan = version ? found?.bundle.planHistory[String(version)] : null;
    const confirm = await updateProgress(uid, session.id, { confirm: true, status: "CONFIRMED" });
    const reload = await getSession(session.id);
    const v2 = reload?.bundle.session.currentPlanVersion;
    const plan2 = v2 ? reload?.bundle.planHistory[String(v2)] : null;
    after = {
      status: found?.run.status ?? null,
      travelMode: found?.bundle.session.input.travelMode ?? null,
      question: found?.run.waitingQuestion?.id ?? null,
      legs:
        plan?.legs.map((l) => ({
          mode: l.mode,
          min: l.durationMinutes.value,
          from: l.from,
          to: l.to,
        })) ?? [],
      confirmOk: confirm.ok,
      confirmError: confirm.ok ? null : confirm.error,
      reloadStatus: reload?.bundle.session.status ?? null,
      reloadTravelMode: reload?.bundle.session.input.travelMode ?? null,
      reloadLegs: plan2?.legs.map((l) => `${l.mode}:${l.durationMinutes.value}`) ?? [],
    };
  }
  const out = {
    runtime: env.runtime,
    runId: started.runId,
    q1: q1 ? { id: q1.id, promptHead: q1.prompt.slice(0, 180) } : null,
    after,
  };
  writeFileSync(resolve("docs/reports/mock-walk-transit.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
