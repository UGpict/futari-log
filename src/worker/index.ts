import { WORKER, LIMITS } from "@/config/settings";
import { claimPendingRun, heartbeat } from "@/server/agent/lease";
import { executeRun } from "@/server/agent/execute";

const inflight = new Set<string>();

async function loop() {
  const concurrency = 1;
  if (inflight.size >= concurrency) return;
  const runId = await claimPendingRun();
  if (!runId) return;
  inflight.add(runId);
  const beat = setInterval(() => {
    void heartbeat(runId);
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
  setInterval(() => {
    void loop();
  }, WORKER.pollMs);
}

if (process.argv[1]?.includes("worker")) {
  console.log(`ふたりログ worker pid=${process.pid} concurrency=${LIMITS.maxConcurrentExternal}`);
  startWorker();
}
