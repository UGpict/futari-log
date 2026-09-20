import type { Db } from "./types";
import { col, lookupDocId, sub } from "./layout";

export type SplitCounts = {
  couples: number;
  sessions: number;
  runs: number;
  events: number;
  planVersions: number;
  reflections: number;
  memories: number;
  approvals: number;
  replays: number;
  lookups: number;
};

export function splitCounts(db: Db): SplitCounts {
  let sessions = 0;
  let runs = 0;
  let events = 0;
  let planVersions = 0;
  let reflections = 0;
  let memories = 0;
  let approvals = 0;
  let replays = 0;
  let lookups = 0;
  for (const couple of Object.values(db.couples)) {
    sessions += Object.keys(couple.sessions).length;
    reflections += Object.keys(couple.reflections).length;
    memories += Object.keys(couple.memories).length;
    approvals += Object.keys(couple.approvals).length;
    replays += Object.keys(couple.replays).length;
    lookups += Object.keys(couple.sessions).length + Object.keys(couple.approvals).length + Object.keys(couple.memories).length + Object.keys(couple.replays).length;
    for (const bundle of Object.values(couple.sessions)) {
      runs += Object.keys(bundle.runs).length;
      events += Object.keys(bundle.events).length;
      planVersions += Object.keys(bundle.planHistory).length;
      lookups += Object.keys(bundle.runs).length;
    }
  }
  return {
    couples: Object.keys(db.couples).length,
    sessions,
    runs,
    events,
    planVersions,
    reflections,
    memories,
    approvals,
    replays,
    lookups,
  };
}

export function splitDocPaths(db: Db): string[] {
  const paths: string[] = [];
  const couples = col("couples");
  for (const couple of Object.values(db.couples)) {
    const cid = couple.couple.id;
    paths.push(`${couples}/${cid}`);
    for (const [id] of Object.entries(couple.memories)) {
      paths.push(`${couples}/${cid}/${sub("memories")}/${id}`);
      paths.push(`${col("lookups")}/${lookupDocId("memory", id)}`);
    }
    for (const [id] of Object.entries(couple.memoryCandidates)) {
      paths.push(`${couples}/${cid}/${sub("memoryCandidates")}/${id}`);
    }
    for (const [id] of Object.entries(couple.reflections)) {
      paths.push(`${couples}/${cid}/${sub("reflections")}/${id}`);
    }
    for (const [id] of Object.entries(couple.approvals)) {
      paths.push(`${couples}/${cid}/${sub("approvals")}/${id}`);
      paths.push(`${col("lookups")}/${lookupDocId("approval", id)}`);
    }
    for (const [id] of Object.entries(couple.replays)) {
      paths.push(`${couples}/${cid}/${sub("replays")}/${id}`);
      paths.push(`${col("lookups")}/${lookupDocId("replay", id)}`);
    }
    for (const bundle of Object.values(couple.sessions)) {
      const sid = bundle.session.id;
      paths.push(`${couples}/${cid}/${sub("sessions")}/${sid}`);
      paths.push(`${col("lookups")}/${lookupDocId("session", sid)}`);
      for (const run of Object.values(bundle.runs)) {
        paths.push(`${couples}/${cid}/${sub("sessions")}/${sid}/${sub("runs")}/${run.id}`);
        paths.push(`${col("lookups")}/${lookupDocId("run", run.id)}`);
      }
      for (const event of Object.values(bundle.events)) {
        paths.push(`${couples}/${cid}/${sub("sessions")}/${sid}/${sub("events")}/${event.eventId}`);
      }
      for (const version of Object.keys(bundle.planHistory)) {
        paths.push(`${couples}/${cid}/${sub("sessions")}/${sid}/${sub("planVersions")}/${version}`);
      }
    }
  }
  for (const key of Object.keys(db.idempotency)) {
    paths.push(`${col("idempotency")}/${key}`);
  }
  return paths;
}

export function assertRelationships(db: Db): string[] {
  const errors: string[] = [];
  for (const couple of Object.values(db.couples)) {
    for (const bundle of Object.values(couple.sessions)) {
      if (bundle.session.coupleId !== couple.couple.id) {
        errors.push(`session ${bundle.session.id} coupleId mismatch`);
      }
      for (const run of Object.values(bundle.runs)) {
        if (run.sessionId !== bundle.session.id) errors.push(`run ${run.id} session mismatch`);
        if (run.coupleId !== couple.couple.id) errors.push(`run ${run.id} couple mismatch`);
      }
      for (const event of Object.values(bundle.events)) {
        if (!bundle.runs[event.runId] && !Object.values(bundle.runs).some((r) => r.id === event.runId)) {
          errors.push(`event ${event.eventId} missing run ${event.runId}`);
        }
      }
    }
    for (const approval of Object.values(couple.approvals)) {
      if (approval.coupleId !== couple.couple.id) errors.push(`approval ${approval.id} couple mismatch`);
    }
  }
  return errors;
}
