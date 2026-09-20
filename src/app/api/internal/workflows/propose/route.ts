import { z } from "zod";
import { json, readJson } from "@/server/api/http";
import { getEnv } from "@/config/env";
import { executeRun } from "@/server/agent/execute";
import { workflowHeaderOk } from "@/server/workflows/auth";
import { getRun } from "@/server/repositories/store";

const bodySchema = z.object({ runId: z.string().min(1) });

export async function POST(request: Request) {
  const env = getEnv();
  if (!workflowHeaderOk(request.headers.get("x-futari-workflow"), env.workflowInvokeSecret)) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await readJson(request, bodySchema);
  if ("error" in body) return body.error;
  await executeRun(body.data.runId, "propose");
  const found = await getRun(body.data.runId);
  return json({ ok: true, step: "propose", status: found?.run.status ?? null });
}
