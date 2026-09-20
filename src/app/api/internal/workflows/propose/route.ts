import { z } from "zod";
import { json, readJson } from "@/server/api/http";
import { getEnv } from "@/config/env";
import { executeRun } from "@/server/agent/execute";
import { workflowHeaderOk } from "@/server/workflows/auth";
import { findRun, readStore } from "@/server/repositories/store";

const bodySchema = z.object({ runId: z.string().min(1) });

export async function POST(request: Request) {
  const env = getEnv();
  if (!workflowHeaderOk(request.headers.get("x-futari-workflow"), env.workflowInvokeSecret)) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = await readJson(request, bodySchema);
  if ("error" in body) return body.error;
  await executeRun(body.data.runId, "propose");
  const run = await readStore((db) => findRun(db, body.data.runId)?.run ?? null);
  return json({ ok: true, step: "propose", status: run?.status ?? null });
}
