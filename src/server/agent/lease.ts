import { LIMITS, WORKER } from "@/config/settings";
import type { AppEvent } from "@/domain/schemas";
import { getEnv } from "@/config/env";
import { realNowIso } from "@/lib/time";
import { newId } from "@/lib/ids";
import { findRun, withStore } from "@/server/repositories/store";
import { claimRunDoc, expireAndClaimPending, heartbeatDoc } from "@/server/repositories/firestoreSplit";

export const WORKER_ID = `worker_${process.pid}`;

function expiredEvent(runId: string, seq: number): AppEvent {
  return {
    eventId: newId("evt"),
    runId,
    seq,
    at: realNowIso(),
    type: "RUN_FINISHED",
    summary: "lease切れのため INTERRUPTED。既存イベントとプランは保持",
    evidenceIds: [],
    model: null,
    pool: null,
    requestedModel: null,
    actualModel: null,
    usage: null,
    payload: { status: "INTERRUPTED" },
  };
}

export async function claimPendingRun(): Promise<string | null> {
  if (getEnv().dataBackend === "firestore") {
    return expireAndClaimPending(WORKER_ID, WORKER.leaseMs, expiredEvent);
  }
  return withStore((db) => {
    const now = Date.now();
    for (const couple of Object.values(db.couples)) {
      for (const bundle of Object.values(couple.sessions)) {
        for (const run of Object.values(bundle.runs)) {
          if (run.status === "RUNNING" && run.leaseExpiresAt) {
            if (new Date(run.leaseExpiresAt).getTime() < now) {
              run.status = "INTERRUPTED";
              run.leaseOwner = null;
              run.error = "lease expired; not restarted from scratch";
              run.finishedAt = realNowIso();
              const event = expiredEvent(run.id, Object.keys(bundle.events).length);
              bundle.events[event.eventId] = event;
            }
          }
        }
      }
    }
    const pending = [];
    for (const couple of Object.values(db.couples)) {
      for (const bundle of Object.values(couple.sessions)) {
        pending.push(...Object.values(bundle.runs).filter((r) => r.status === "PENDING"));
      }
    }
    pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const run = pending[0];
    if (!run) return null;
    const found = findRun(db, run.id);
    if (!found) return null;
    if (found.run.leaseOwner && found.run.leaseExpiresAt && new Date(found.run.leaseExpiresAt).getTime() > now) {
      return null;
    }
    found.run.status = "RUNNING";
    found.run.startedAt = found.run.startedAt ?? realNowIso();
    found.run.leaseOwner = WORKER_ID;
    found.run.heartbeatAt = realNowIso();
    found.run.leaseExpiresAt = new Date(Date.now() + WORKER.leaseMs).toISOString();
    return found.run.id;
  });
}

export async function claimRun(runId: string, owner: string = WORKER_ID): Promise<boolean> {
  if (getEnv().dataBackend === "firestore") {
    return claimRunDoc(runId, owner, WORKER.leaseMs);
  }
  return withStore((db) => {
    const found = findRun(db, runId);
    if (!found) return false;
    const now = Date.now();
    if (found.run.status === "RUNNING") {
      if (found.run.leaseOwner === owner) {
        found.run.heartbeatAt = realNowIso();
        found.run.leaseExpiresAt = new Date(Date.now() + WORKER.leaseMs).toISOString();
        return true;
      }
      if (found.run.leaseExpiresAt && new Date(found.run.leaseExpiresAt).getTime() > now) {
        return false;
      }
    } else if (found.run.status !== "PENDING") {
      return false;
    }
    found.run.status = "RUNNING";
    found.run.startedAt = found.run.startedAt ?? realNowIso();
    found.run.leaseOwner = owner;
    found.run.heartbeatAt = realNowIso();
    found.run.leaseExpiresAt = new Date(Date.now() + WORKER.leaseMs).toISOString();
    return true;
  });
}

export async function heartbeat(runId: string): Promise<boolean> {
  if (getEnv().dataBackend === "firestore") {
    return heartbeatDoc(runId, WORKER.leaseMs);
  }
  return withStore((db) => {
    const found = findRun(db, runId);
    if (!found) return false;
    if (!found.run.leaseOwner) return false;
    found.run.heartbeatAt = realNowIso();
    found.run.leaseExpiresAt = new Date(Date.now() + WORKER.leaseMs).toISOString();
    return true;
  });
}

void LIMITS;
