import { json, readJson, bearer } from "@/server/api/http";
import { getEnv } from "@/config/env";
import { enrichSpotPrice } from "@/server/catalog/priceEnrich";
import { verifyGoogleIdToken } from "@/server/catalog/oidc";
import { priceEnrichRequestSchema } from "@/contracts/price";

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
  const body = await readJson(request, priceEnrichRequestSchema);
  if ("error" in body) return body.error;
  const result = await enrichSpotPrice({
    placeId: body.data.placeId,
    venueName: body.data.venueName,
    address: body.data.address,
    websiteUri: body.data.websiteUri ?? null,
    reason: body.data.reason ?? "scheduler",
    owner: "scheduler-oidc",
  });
  const status = result.status === "SKIPPED_DUPLICATE" ? 409 : result.ok ? 200 : 502;
  return json(
    {
      ok: result.ok,
      runId: result.runId,
      status: result.status,
      factsSaved: result.factsSaved,
      error: result.error,
    },
    status,
  );
}
