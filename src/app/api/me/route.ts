import { json, requireUid } from "@/server/api/http";
import { getEnv, publicBlockers } from "@/config/env";
import { ownerCoupleId } from "@/server/api/actions";
import { presentMe } from "@/server/api/presenters";
import { resolveAuthIdentity } from "@/server/auth";

export async function GET(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const env = getEnv();
  const [coupleId, identity] = await Promise.all([
    ownerCoupleId(auth.uid),
    resolveAuthIdentity(auth.uid),
  ]);
  return json(
    presentMe({
      uid: auth.uid,
      coupleId,
      runtime: env.runtime,
      authBackend: env.authBackend,
      dataBackend: env.dataBackend,
      emulator: env.emulator,
      demoControls: env.enableDemoControls,
      demoAreaName: env.demoAreaName,
      demoDate: env.demoDate,
      demoLat: env.demoLat,
      demoLng: env.demoLng,
      isAnonymous: identity.isAnonymous,
      authProviders: identity.authProviders,
      blockers: publicBlockers(),
    }),
  );
}