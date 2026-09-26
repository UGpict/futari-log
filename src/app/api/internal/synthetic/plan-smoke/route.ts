import { json, bearer } from "@/server/api/http";
import { getEnv } from "@/config/env";
import { verifyGoogleIdToken } from "@/server/catalog/oidc";
import { runPlanSmokeSynthetic } from "@/server/ops/synthetic";

async function authorized(request: Request): Promise<boolean> {
  const env = getEnv();
  const audience = env.syntheticOidcAudience;
  const token = bearer(request);
  if (!audience || !token) return false;
  const verified = await verifyGoogleIdToken({
    token,
    audience,
    email: env.syntheticOidcServiceAccount,
  }).catch(() => null);
  return Boolean(verified);
}

/**
 * Cloud Scheduler → OIDC → MOCK plan smoke (Phase 1 fixtures).
 * Does not call LIVE Places/Routes/LLM. Failures return 502 + structured metric.
 */
export async function POST(request: Request) {
  if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
  const result = await runPlanSmokeSynthetic();
  return json(
    {
      ok: result.ok,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      latencyMs: result.latencyMs,
      results: result.results,
    },
    result.ok ? 200 : 502,
  );
}
