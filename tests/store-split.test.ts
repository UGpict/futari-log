import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { listedOnCalendar } from "../src/server/repositories/calendarFields";
import { assertRelationships, splitCounts, splitDocPaths } from "../src/server/repositories/splitMap";
import { emptyCoupleBundle, emptyDb, emptySessionBundle } from "../src/server/repositories/types";
import { createCouple, createSession, decideApproval, getSessionSnapshot, startRun } from "../src/server/api/actions";
import { getSession, withRun, withSession } from "../src/server/repositories/store";
import { realNowIso } from "../src/lib/time";
import { evaluateWalkLimits, walkAckFingerprint, walkLongAckMatches, walkLongAcknowledged, longWalkQuestion, describeWalkOverages } from "../src/domain/plan/walkLimits";
import { WALK_LIMITS } from "../src/config/settings";

const planInput = {
  dateTokyo: "2026-09-20",
  startTime: "13:00",
  endTime: "18:00",
  meet: { name: "東京駅", lat: 35.681236, lng: 139.767125, spotId: "ChIJ35r7EABjUjoRIqY6CClYKqs" },
  end: { name: "新宿駅", lat: 35.690921, lng: 139.700258, spotId: "ChIJ5aHh9wqNGGARKfwN1ZCK_3w" },
  budget: { mealsJpy: 6000, facilitiesJpy: 3000, transitJpy: 1000 },
  preferences: [
    {
      id: "pref_self",
      subject: "SELF" as const,
      content: "カフェ",
      priority: "PREFER" as const,
      source: "SELF_REPORT" as const,
    },
  ],
  fixedAppointments: [],
  autoApply: { enabled: false, acknowledgedScope: null, validUntil: null },
  travelMode: "WALK" as const,
  areaName: "東京駅",
  areaLat: 35.681236,
  areaLng: 139.767125,
  radiusMeters: 2500,
};

describe("walk ack scope", () => {
  const leg = (minutes: number | null) => ({
    mode: "WALK" as const,
    durationMinutes: { value: minutes, evidenceIds: [] as string[] },
  });

  it("does not stop on total-only over soft 45 when each leg is under the per-leg limit", () => {
    const result = evaluateWalkLimits("WALK", [leg(15), leg(15), leg(20)]);
    assert.equal(result.totalMinutes, 50);
    assert.equal(result.softTotalExceeded, true);
    assert.equal(result.overLeg, false);
    assert.equal(result.exceeds, false);
  });

  it("flags a single long leg without requiring total over soft limit", () => {
    const result = evaluateWalkLimits("WALK", [leg(8), leg(12), leg(40)]);
    assert.equal(result.exceeds, true);
    assert.equal(result.overLeg, true);
    assert.equal(result.longestLegMinutes, 40);
    assert.ok(result.longestLegMinutes > WALK_LIMITS.legMinutes);
    assert.equal(evaluateWalkLimits("TRANSIT", [leg(40)], { enforcePerLeg: false }).exceeds, false);
  });

  it("enforces an explicit hard total from options", () => {
    const result = evaluateWalkLimits("WALK", [leg(15), leg(15), leg(20)], {
      hardTotalMinutes: 40,
    });
    assert.equal(result.overTotal, true);
    assert.equal(result.exceeds, true);
  });

  it("asks about the problem leg without saying no walkable places exist", () => {
    const legs = [
      {
        id: "l1",
        mode: "WALK" as const,
        from: "SPOT" as const,
        fromSpotId: "museum",
        to: "SPOT" as const,
        toSpotId: "dinner",
        durationMinutes: { value: 38, evidenceIds: [] as string[] },
      },
    ];
    const result = evaluateWalkLimits("WALK", legs);
    const details = describeWalkOverages(result, legs, {
      museum: { name: "美術館" },
      dinner: { name: "夕食のお店" },
    });
    const q = longWalkQuestion(result, details, {
      museum: { name: "美術館" },
      dinner: { name: "夕食のお店" },
    });
    assert.match(q.prompt, /美術館から夕食のお店まで徒歩38分/);
    assert.match(q.prompt, /この区間で公共交通を使いますか/);
    assert.equal(/徒歩で行ける場所がな/.test(q.prompt), false);
  });

  it("scopes long-walk consent to acknowledged long legs and re-asks for a new long leg", () => {
    const fingerprint = walkAckFingerprint({
      dateTokyo: "2026-09-20",
      travelMode: "WALK",
      meetSpotId: "meet",
      endSpotId: "end",
      spotIds: ["a", "b"],
      longestLegMinutes: 40,
      totalMinutes: 55,
      acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:b", minutes: 40 }],
    });
    const ack = {
      fingerprint,
      at: "2026-09-20T00:00:00.000Z",
      dateTokyo: "2026-09-20",
      travelMode: "WALK",
      meetSpotId: "meet",
      endSpotId: "end",
      routeSpotIds: ["a", "b"],
      longestLegMinutes: 40,
      totalMinutes: 55,
      acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:b", minutes: 40 }],
    };
    assert.equal(walkLongAckMatches(ack, fingerprint), true);
    assert.equal(
      walkLongAckMatches(
        ack,
        walkAckFingerprint({
          dateTokyo: "2026-09-20",
          travelMode: "WALK",
          meetSpotId: "meet",
          endSpotId: "end",
          spotIds: ["a", "c"],
          longestLegMinutes: 42,
          totalMinutes: 60,
          acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:c", minutes: 42 }],
        }),
      ),
      false,
    );
    assert.equal(
      walkLongAckMatches(
        ack,
        walkAckFingerprint({
          dateTokyo: "2026-09-20",
          travelMode: "WALK",
          meetSpotId: "meet",
          endSpotId: "end",
          spotIds: ["a", "b"],
          longestLegMinutes: 41,
          totalMinutes: 80,
          acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:b", minutes: 41 }],
        }),
      ),
      true,
    );
    assert.equal(walkLongAcknowledged({ walkLongAcknowledged: true }), false);
  });

  it("re-asks when the same long leg grows beyond slack", () => {
    const fingerprint = walkAckFingerprint({
      dateTokyo: "2026-09-20",
      travelMode: "WALK",
      meetSpotId: "meet",
      endSpotId: "end",
      spotIds: ["a", "b"],
      longestLegMinutes: 40,
      totalMinutes: 55,
      acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:b", minutes: 40 }],
    });
    const ack = {
      fingerprint,
      at: "2026-09-20T00:00:00.000Z",
      dateTokyo: "2026-09-20",
      travelMode: "WALK",
      meetSpotId: "meet",
      endSpotId: "end",
      routeSpotIds: ["a", "b"],
      longestLegMinutes: 40,
      totalMinutes: 55,
      acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:b", minutes: 40 }],
    };
    assert.equal(
      walkLongAckMatches(
        ack,
        walkAckFingerprint({
          dateTokyo: "2026-09-20",
          travelMode: "WALK",
          meetSpotId: "meet",
          endSpotId: "end",
          spotIds: ["a", "b"],
          longestLegMinutes: 50,
          totalMinutes: 70,
          acknowledgedLongLegs: [{ key: "SPOT:a->SPOT:b", minutes: 50 }],
        }),
      ),
      false,
    );
  });
});

describe("firestore split mapping", () => {
  it("does not put two sessions' events onto one parent path", () => {
    const db = emptyDb();
    const couple = emptyCoupleBundle({
      id: "cpl_a",
      ownerUid: "uid_a",
      isDemo: true,
      createdAt: "2026-09-20T00:00:00.000Z",
    });
    const s1 = emptySessionBundle({
      id: "ses_1",
      coupleId: "cpl_a",
      ownerUid: "uid_a",
      status: "DRAFT",
      input: planInput,
      currentPlanVersion: 1,
      currentLocation: null,
      scheduleNow: null,
      isDemo: true,
      createdAt: "2026-09-20T00:00:00.000Z",
    });
    const s2 = emptySessionBundle({
      id: "ses_2",
      coupleId: "cpl_a",
      ownerUid: "uid_a",
      status: "CONFIRMED",
      input: { ...planInput, dateTokyo: "2026-09-21" },
      currentPlanVersion: 1,
      currentLocation: null,
      scheduleNow: null,
      isDemo: true,
      createdAt: "2026-09-20T00:00:00.000Z",
    });
    s1.events.evt_1 = {
      eventId: "evt_1",
      runId: "run_1",
      seq: 0,
      at: "2026-09-20T00:00:00.000Z",
      type: "RUN_STARTED",
      summary: "one",
      evidenceIds: [],
      model: null,
      pool: null,
      requestedModel: null,
      actualModel: null,
      usage: null,
      payload: null,
    };
    s1.runs.run_1 = {
      id: "run_1",
      coupleId: "cpl_a",
      sessionId: "ses_1",
      ownerUid: "uid_a",
      kind: "INITIAL_PLAN",
      status: "SUCCEEDED",
      mode: "LIVE",
      displayRuntime: "MOCK",
      createdAt: "2026-09-20T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      deadlineAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      heartbeatAt: null,
      trigger: null,
      basePlanVersion: null,
      resultPlanVersion: 1,
      waitingQuestion: null,
      waitingApprovalId: null,
      error: null,
      cost: { llmUsd: 0, llmJpy: 0, apiJpy: 0, mundaneCalls: 0, hardCalls: 0, unaccountedCalls: 0 },
      versions: { schema: "1", prompt: "1", tool: "1", modelSettings: "1", git: null },
    };
    s2.events.evt_2 = { ...s1.events.evt_1, eventId: "evt_2", runId: "run_2", summary: "two" };
    s2.runs.run_2 = { ...s1.runs.run_1, id: "run_2", sessionId: "ses_2" };
    couple.sessions.ses_1 = s1;
    couple.sessions.ses_2 = s2;
    db.couples.cpl_a = couple;
    const paths = splitDocPaths(db);
    assert.equal(paths.some((p) => p.endsWith("/ses_1/events/evt_1") || p.includes("/ses_1/") && p.endsWith("/evt_1")), true);
    assert.equal(paths.some((p) => p.includes("/ses_2/") && p.endsWith("/evt_2")), true);
    assert.equal(paths.some((p) => p === "sys/root"), false);
    const counts = splitCounts(db);
    assert.equal(counts.sessions, 2);
    assert.equal(counts.events, 2);
    assert.equal(counts.runs, 2);
    assert.deepEqual(assertRelationships(db), []);
    assert.equal(listedOnCalendar(s1.session), true);
    assert.equal(listedOnCalendar({ ...s1.session, currentPlanVersion: null }), false);
  });
});

describe("file backend isolation", () => {
  const previous = process.env.DATA_BACKEND;
  process.env.DATA_BACKEND = "file";

  it("keeps a second session's events off the first session bundle", async () => {
    const uid = `anon_split_${Date.now()}`;
    const couple = await createCouple(uid, true);
    const a = await createSession(uid, couple.id, planInput);
    const b = await createSession(uid, couple.id, { ...planInput, dateTokyo: "2026-09-21" });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    if (!a.ok || !b.ok) return;
    const started = await startRun({ uid, sessionId: a.id, kind: "INITIAL_PLAN", bodyHash: "h1" });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    await withRun(started.runId, (found) => {
      if (!found) return;
      found.bundle.events.evt_local = {
        eventId: "evt_local",
        runId: started.runId,
        seq: 0,
        at: "2026-09-20T00:00:00.000Z",
        type: "NOTICE",
        summary: "isolated",
        evidenceIds: [],
        model: null,
        pool: null,
        requestedModel: null,
        actualModel: null,
        usage: null,
        payload: null,
      };
    });
    const first = await getSession(a.id);
    const second = await getSession(b.id);
    assert.equal(first?.bundle.events.evt_local?.summary, "isolated");
    assert.equal(second?.bundle.events.evt_local, undefined);
    assert.equal(first?.couple.couple.ownerUid, uid);
  });

  it("rejects another user and duplicate/stale approvals", async () => {
    const uid = `anon_authz_${Date.now()}`;
    const couple = await createCouple(uid, true);
    const created = await createSession(uid, couple.id, planInput);
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const other = await getSessionSnapshot("uid_other", created.id);
    assert.equal(other.ok, false);
    if (!other.ok) assert.equal(other.status, 403);

    const approvalId = `appr_${created.id}`;
    await withSession(created.id, (found) => {
      if (!found) return;
      found.bundle.session.currentPlanVersion = 1;
      found.couple.approvals[approvalId] = {
        id: approvalId,
        coupleId: couple.id,
        sessionId: created.id,
        runId: "run_x",
        planVersionFrom: 1,
        planVersionTo: 2,
        kind: "PLAN_APPLY",
        status: "PENDING",
        summary: "test",
        diff: null,
        consumedAt: null,
        createdAt: realNowIso(),
      };
    });
    const first = await decideApproval(uid, approvalId, "APPROVE");
    assert.equal(first.ok, true, !first.ok ? `${first.status}:${first.error}` : "");
    const dup = await decideApproval(uid, approvalId, "APPROVE");
    assert.equal(dup.ok, false);
    if (!dup.ok) assert.equal(dup.status, 409);

    const staleId = `appr_stale_${created.id}`;
    await withSession(created.id, (found) => {
      if (!found) return;
      found.bundle.session.currentPlanVersion = 1;
      found.couple.approvals[staleId] = {
        id: staleId,
        coupleId: couple.id,
        sessionId: created.id,
        runId: "run_x",
        planVersionFrom: 0,
        planVersionTo: 2,
        kind: "PLAN_APPLY",
        status: "PENDING",
        summary: "stale",
        diff: null,
        consumedAt: null,
        createdAt: realNowIso(),
      };
    });
    const stale = await decideApproval(uid, staleId, "APPROVE");
    assert.equal(stale.ok, false);
    if (!stale.ok) {
      assert.equal(stale.status, 409);
      assert.equal(stale.error, "stale version");
    }
  });

  after(() => {
    if (previous == null) delete process.env.DATA_BACKEND;
    else process.env.DATA_BACKEND = previous;
  });
});
