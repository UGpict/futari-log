import { WORKER, LIMITS } from "@/config/settings";
import { getEnv } from "@/config/env";
import { claimPendingRun, heartbeat } from "@/server/agent/lease";
import { executeRun } from "@/server/agent/execute";

const inflight = new Set<string>();

async function loop() {
  const concurrency = 1;
  if (inflight.size >= concurrency) return;
  let runId: string | null = null;
  try {
    runId = await claimPendingRun();
  } catch (error) {
    console.error("worker claim failed", error);
    return;
  }
  if (!runId) return;
  inflight.add(runId);
  const beat = setInterval(() => {
    void heartbeat(runId).catch((error) => console.error("worker heartbeat failed", runId, error));
  }, WORKER.heartbeatMs);
  try {
    await executeRun(runId);
  } catch (error) {
    console.error("worker run failed", runId, error);
  } finally {
    clearInterval(beat);
    inflight.delete(runId);
  }
}

export function startWorker() {
  if (getEnv().planOrchestrator === "workflows") {
    console.log("worker idle: PLAN_ORCHESTRATOR=workflows");
    return;
  }
  setInterval(() => {
    void loop().catch((error) => console.error("worker loop failed", error));
  }, WORKER.pollMs);
}

if (process.argv[1]?.includes("worker")) {
  console.log(`ふたりログ worker pid=${process.pid} concurrency=${LIMITS.maxConcurrentExternal}`);
  startWorker();
}
