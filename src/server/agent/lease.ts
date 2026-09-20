import { LIMITS, WORKER } from "@/config/settings";
import type { AppEvent, Run } from "@/domain/schemas";
import { realNowIso } from "@/lib/time";
import { findRun, withStore } from "@/server/repositories/store";
import { newId } from "@/lib/ids";

export const WORKER_ID = `worker_${process.pid}`;

export async function claimPendingRun(): Promise<string | null> {
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
              const seq = Object.keys(bundle.events).length;
              const event: AppEvent = {
                eventId: newId("evt"),
                runId: run.id,
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
              bundle.events[event.eventId] = event;
            }
          }
        }
      }
    }

    const pending: Run[] = [];
    for (const couple of Object.values(db.couples)) {
      for (const bundle of Object.values(couple.sessions)) {
        pending.push(
          ...Object.values(bundle.runs).filter((r) => r.status === "PENDING"),
        );
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

export async function heartbeat(runId: string): Promise<boolean> {
  return withStore((db) => {
    const found = findRun(db, runId);
    if (!found) return false;
    if (found.run.leaseOwner !== WORKER_ID) return false;
    found.run.heartbeatAt = realNowIso();
    found.run.leaseExpiresAt = new Date(Date.now() + WORKER.leaseMs).toISOString();
    return true;
  });
}

void LIMITS;
