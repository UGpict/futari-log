/**
 * LIVE verify: walk limit → 公共交通を使う → per-leg mode / provisional / confirm block.
 * Does not print secrets. Usage: npx tsx scripts/verify-transit-switch.ts
 */
import { getEnv } from "../src/config/env";
import { createCouple, createSession, startRun, answerQuestion, updateProgress } from "../src/server/api/actions";
import { executeRun } from "../src/server/agent/execute";
import { getRun, getSession } from "../src/server/repositories/store";
import { sha256 } from "../src/lib/ids";
import { hasUnverifiedTravel } from "../src/domain/plan/walkLimits";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const uid = "anon_transit_verify";
const date = process.env.VERIFY_DATE ?? "2026-09-21";

async function runOnce(
  label: string,
  end: { name: string; lat: number; lng: number; spotId: string },
) {
  const couple = await createCouple(uid, true);
  const session = await createSession(uid, couple.id, {
    dateTokyo: date,
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs" },
    end: { ...end, spotId: end.spotId },
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
    trigger: `transit-verify-${label}`,
    bodyHash: sha256(`transit-verify-${label}`),
  });
  if (!started.ok) throw new Error(started.error);

  await executeRun(started.runId);
  let found = await getRun(started.runId);
  if (!found) throw new Error("run missing");

  const steps: Record<string, unknown>[] = [
    {
      step: "initial",
      runId: found.run.id,
      status: found.run.status,
      question: found.run.waitingQuestion,
      travelMode: found.bundle.session.input.travelMode,
    },
  ];

  if (found.run.status === "WAITING_INPUT" && found.run.waitingQuestion?.id === "q_long_walk") {
    const answered = await answerQuestion(uid, found.run.id, "q_long_walk", "公共交通を使う");
    if (!answered.ok) throw new Error(answered.error);
    if (answered.restart) {
      await executeRun(found.run.id);
      found = await getRun(found.run.id);
      if (!found) throw new Error("transit run missing");
      steps.push({
        step: "after_transit",
        runId: found.run.id,
        status: found.run.status,
        question: found.run.waitingQuestion,
        travelMode: found.bundle.session.input.travelMode,
      });
    }
  }

  if (found.run.status === "WAITING_INPUT" && found.run.waitingQuestion?.id === "q_travel_unverified") {
    steps.push({
      step: "travel_unverified_waiting",
      runId: found.run.id,
      question: found.run.waitingQuestion,
    });
  }

  const version = found.bundle.session.currentPlanVersion;
  const plan = version ? found.bundle.planHistory[String(version)] : null;
  const legs =
    plan?.legs.map((leg) => ({
      id: leg.id,
      from: leg.from,
      to: leg.to,
      mode: leg.mode,
      durationMinutes: leg.durationMinutes.value,
      note: plan.assumptions.find((line) => line.includes(leg.id)) ?? null,
    })) ?? [];

  const confirm = await updateProgress(uid, session.id, { confirm: true, status: "CONFIRMED" });
  const snap = await getSession(session.id);

  return {
    label,
    steps,
    finalRunId: found.run.id,
    finalStatus: found.run.status,
    waitingQuestion: found.run.waitingQuestion,
    travelMode: found.bundle.session.input.travelMode,
    validation: plan?.validation ?? null,
    travelUnverified: plan ? hasUnverifiedTravel(plan.validation.issues) : null,
    legs,
    assumptionsHead: (plan?.assumptions ?? []).slice(0, 8),
    confirmOk: confirm.ok,
    confirmError: confirm.ok ? null : confirm.error,
    sessionStatus: snap?.bundle.session.status ?? null,
  };
}

async function runTransitDirect(label: string) {
  const couple = await createCouple(uid, true);
  const session = await createSession(uid, couple.id, {
    dateTokyo: date,
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs" },
    end: { name: "新宿駅", lat: 35.689487, lng: 139.691706, spotId: "ChIJ5aHh9wqNGGARKfwN1ZCK_3w" },
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
    travelMode: "TRANSIT",
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
    trigger: `transit-direct-${label}`,
    bodyHash: sha256(`transit-direct-${label}`),
  });
  if (!started.ok) throw new Error(started.error);
  await executeRun(started.runId);
  const found = await getRun(started.runId);
  if (!found) throw new Error("run missing");
  const version = found.bundle.session.currentPlanVersion;
  const plan = version ? found.bundle.planHistory[String(version)] : null;
  const confirm = await updateProgress(uid, session.id, { confirm: true, status: "CONFIRMED" });
  return {
    label,
    runId: found.run.id,
    status: found.run.status,
    question: found.run.waitingQuestion,
    travelMode: found.bundle.session.input.travelMode,
    validation: plan?.validation ?? null,
    travelUnverified: plan ? hasUnverifiedTravel(plan.validation.issues) : null,
    legs:
      plan?.legs.map((leg) => ({
        from: leg.from,
        to: leg.to,
        mode: leg.mode,
        durationMinutes: leg.durationMinutes.value,
      })) ?? [],
    assumptionsHead: (plan?.assumptions ?? []).slice(0, 10),
    confirmOk: confirm.ok,
    confirmError: confirm.ok ? null : confirm.error,
  };
}


async function main() {
  const env = getEnv();
  const report = {
    runtime: env.runtime,
    dataBackend: env.dataBackend,
    maps: env.mapsConfigured,
    near: await runOnce("near_end", {
      name: "東京駅",
      lat: 35.681236,
      lng: 139.767125,
      spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs",
    }),
    transitDirect: await runTransitDirect("shinjuku_end"),
  };
  const path = resolve("docs/reports/transit-switch-verify.json");
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log("wrote", path);
  console.log(
    JSON.stringify(
      {
        runtime: report.runtime,
        nearRunId: report.near.finalRunId,
        nearStatus: report.near.finalStatus,
        nearConfirmOk: report.near.confirmOk,
        nearLegs: report.near.legs.map((l) => `${l.mode}:${l.durationMinutes}`),
        transitRunId: report.transitDirect.runId,
        transitStatus: report.transitDirect.status,
        transitQuestion: report.transitDirect.question?.id ?? null,
        transitUnverified: report.transitDirect.travelUnverified,
        transitConfirmOk: report.transitDirect.confirmOk,
        transitConfirmError: report.transitDirect.confirmError,
        transitLegs: report.transitDirect.legs.map((l) => `${l.mode}:${l.durationMinutes}`),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
