import { json, readJson, bearer } from "@/server/api/http";
import { getEnv } from "@/config/env";
import { ingestEvents } from "@/server/catalog/ingest";
import { verifyGoogleIdToken } from "@/server/catalog/oidc";
import { catalogIngestRequestSchema } from "@/contracts/catalog";

async function authorized(request: Request): Promise<boolean> {
  const env = getEnv();
  const audience = env.ingestOidcAudience;
  const token = bearer(request);
  if (!audience || !token) return false;
  const verified = await verifyGoogleIdToken({
    token,
    audience,
    email: env.ingestOidcServiceAccount,
  }).catch(() => null);
  return Boolean(verified);
}

export async function POST(request: Request) {
  if (!(await authorized(request))) return json({ error: "unauthorized" }, 401);
  const body = await readJson(request, catalogIngestRequestSchema);
  if ("error" in body) return body.error;
  const result = await ingestEvents({
    dateTokyo: body.data.dateTokyo,
    genre: body.data.genre,
    areaName: body.data.areaName,
    owner: "scheduler-oidc",
  });
  const status = result.status === "SKIPPED" ? 409 : result.ok ? 200 : 502;
  return json(
    {
      ok: result.ok,
      runId: result.runId,
      status: result.status,
      saved: result.saved,
      error: result.error,
    },
    status,
  );
}
