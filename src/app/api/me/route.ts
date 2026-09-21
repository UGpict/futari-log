import { json, requireUid } from "@/server/api/http";
import { getEnv, publicBlockers } from "@/config/env";
import { ownerCoupleId } from "@/server/api/actions";
import { presentMe } from "@/server/api/presenters";

export async function GET(request: Request) {
  const auth = await requireUid(request);
  if ("error" in auth) return auth.error;
  const env = getEnv();
  const coupleId = await ownerCoupleId(auth.uid);
  return json(
    presentMe({
      uid: auth.uid,
      coupleId,
      runtime: env.runtime,
      authBackend: env.authBackend,
      dataBackend: env.dataBackend,
      emulator: env.emulator,
      demoControls: env.enableDemoControls,
      demoCalendarStickers: env.demoCalendarStickers,
      demoCalendarAnchorDate: env.demoCalendarAnchorDate,
      demoAreaName: env.demoAreaName,
      demoDate: env.demoDate,
      demoLat: env.demoLat,
      demoLng: env.demoLng,
      blockers: publicBlockers(),
    }),
  );
}