import { createCouple, createSession, startRun } from "../src/server/api/actions";
import { executeRun } from "../src/server/agent/execute";
import { findRun, withStore } from "../src/server/repositories/store";
import { sha256 } from "../src/lib/ids";
import { getEnv } from "../src/config/env";

const uid = "anon_agent_verify";
const date = process.env.VERIFY_DATE ?? "2026-09-21";

async function main() {
  const env = getEnv();
  console.log(
    JSON.stringify({
      runtime: env.runtime,
      dataBackend: env.dataBackend,
      emulator: env.emulator,
      maps: env.mapsConfigured,
      orca: env.orcaConfigured,
      date,
    }),
  );

  const couple = await createCouple(uid, true);
  const session = await createSession(uid, couple.id, {
    dateTokyo: date,
    startTime: "13:00",
    endTime: "18:00",
    meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: null },
    end: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: null },
    budget: { mealsJpy: 8000, facilitiesJpy: 4000, transitJpy: 2000 },
    preferences: [
      { id: "pref_self", subject: "SELF", content: "散歩と展示", priority: "PREFER", source: "SELF_REPORT" },
      {
        id: "pref_partner",
        subject: "PARTNER",
        content: "甘いもの",
        priority: "MUST",
        source: "PARTNER_STATEMENT_REPORTED",
      },
    ],
    fixedAppointments: [],
    autoApply: {
      enabled: true,
      acknowledgedScope: "verify",
      validUntil: "2099-01-01T00:00:00.000Z",
    },
    travelMode: "WALK",
    areaName: "東京駅周辺",
    areaLat: 35.681236,
    areaLng: 139.767125,
    radiusMeters: 2500,
  });
  if (!session.ok) throw new Error(session.error);
  const started = await startRun({
    uid,
    sessionId: session.id,
    kind: "INITIAL_PLAN",
    trigger: "agent-verify",
    bodyHash: sha256("agent-verify"),
  });
  if (!started.ok) throw new Error(started.error);

  await executeRun(started.runId);

  const found = await withStore((db) => findRun(db, started.runId));
  if (!found) throw new Error("run missing");
  const events = Object.values(found.bundle.events)
    .sort((a, b) => a.seq - b.seq)
    .map((e) => ({
      seq: e.seq,
      type: e.type,
      summary: e.summary,
      agent: e.payload && typeof e.payload === "object" ? (e.payload as { agent?: string }).agent : null,
    }));
  const plan = found.bundle.planHistory[String(found.run.resultPlanVersion)];
  const spots = plan
    ? plan.items.map((item) => {
        const spot = found.bundle.spots[item.spotId];
        const opening = plan.openings.find((o) => o.spotId === item.spotId);
        const leg = plan.legs.find((l) => l.toSpotId === item.spotId);
        return {
          name: spot?.name ?? item.spotId,
          opening: opening?.state ?? null,
          cost: spot?.costForTwoJpy.value ?? null,
          travelMin: leg?.durationMinutes.value ?? null,
        };
      })
    : [];
  const memories = Object.fromEntries(
    Object.entries(found.couple.agentMemories ?? {}).map(([id, mem]) => [
      id,
      { notes: mem.notes, factKeys: Object.keys(mem.facts) },
    ]),
  );

  console.log(
    JSON.stringify(
      {
        runId: found.run.id,
        status: found.run.status,
        error: found.run.error,
        toolVersion: found.run.versions.tool,
        validation: plan?.validation ?? null,
        spots,
        agents: memories,
        events: events.filter((e) => e.summary.startsWith("[") || e.type === "MODEL_SELECTED" || e.type === "RUN_FINISHED"),
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
