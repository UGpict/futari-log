import { getEnv } from "@/config/env";
import { executeRun } from "@/server/agent/execute";

async function googleAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}

export async function dispatchProposal(runId: string, kind: string): Promise<void> {
  const env = getEnv();
  if (env.planOrchestrator !== "workflows") return;
  if (!env.publicBaseUrl || !env.firebaseProjectId) {
    console.error("workflow dispatch skipped: PUBLIC_BASE_URL or project missing");
    void executeRun(runId);
    return;
  }
  const token = await googleAccessToken();
  if (!token) {
    console.error("workflow dispatch skipped: no metadata token");
    void executeRun(runId);
    return;
  }
  const url = `https://workflowexecutions.googleapis.com/v1/projects/${env.firebaseProjectId}/locations/${env.workflowLocation}/workflows/${env.workflowName}/executions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      argument: JSON.stringify({
        runId,
        kind,
        baseUrl: env.publicBaseUrl,
        projectId: env.firebaseProjectId,
      }),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`workflow dispatch failed ${res.status} ${detail.slice(0, 200)}`);
    void executeRun(runId);
  }
}
