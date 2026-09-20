import { json, requireUid } from "@/server/api/http";
import { getEnv, publicBlockers } from "@/config/env";
import { ownerCoupleId } from "@/server/api/actions";

export async function GET(request: Request) {
  const auth = requireUid(request);
  if ("error" in auth) return auth.error;
  const env = getEnv();
  const coupleId = await ownerCoupleId(auth.uid);
  return json({
    uid: auth.uid,
    coupleId,
    runtime: env.runtime,
    demoControls: env.enableDemoControls,
    demoAreaName: env.demoAreaName,
    demoDate: env.demoDate,
    demoLat: env.demoLat,
    demoLng: env.demoLng,
    blockers: publicBlockers(),
  });
}
