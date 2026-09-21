/**
 * LIVE Routes probe — prints classification only, never the API key.
 * Usage: npx tsx scripts/probe-routes-live.ts
 */
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { getEnv } from "../src/config/env";
import { computeLiveRoute } from "../src/server/providers/routes";

async function main() {
  const env = getEnv();
  if (!env.googleMapsApiKey) {
    console.error("GOOGLE_MAPS_API_KEY missing");
    process.exit(1);
  }
  const apiKey: string = env.googleMapsApiKey;

  const future = new Date(Date.now() + 2 * 3600_000).toISOString();

  async function probe(
    name: string,
    mode: "WALK" | "TRANSIT" | "DRIVE",
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ) {
    const r = await computeLiveRoute({
      apiKey,
      from,
      to,
      mode,
      departureAt: future,
    });
    return {
      name,
      mode,
      departureAt: future,
      durationMinutes: r.durationMinutes,
      failure: r.failure,
      attempts: r.attempts.map((a) => ({
        via: a.via,
        httpStatus: a.httpStatus,
        googleStatus: a.googleStatus,
        googleMessage: a.googleMessage ? a.googleMessage.slice(0, 120) : null,
        routeCount: a.routeCount,
        failure: a.failure,
        durationMinutes: a.durationMinutes,
      })),
      noteHead: (r.evidence.note ?? "").slice(0, 240),
    };
  }

  const rows = [
    await probe("WALK_near_Tokyo", "WALK", { lat: 35.681236, lng: 139.767125 }, { lat: 35.6785, lng: 139.7705 }),
    await probe("WALK_far_Tokyo", "WALK", { lat: 35.681236, lng: 139.767125 }, { lat: 35.689487, lng: 139.691706 }),
    await probe("TRANSIT_far_Tokyo", "TRANSIT", { lat: 35.681236, lng: 139.767125 }, { lat: 35.689487, lng: 139.691706 }),
    await probe("TRANSIT_far_Osaka", "TRANSIT", { lat: 34.702485, lng: 135.495951 }, { lat: 34.6654, lng: 135.4323 }),
    await probe("TRANSIT_SF", "TRANSIT", { lat: 37.7749, lng: -122.4194 }, { lat: 37.8199, lng: -122.4783 }),
  ];

  const outPath = resolve(process.cwd(), "docs/reports/routes-probe-live.json");
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
  console.log(`wrote ${outPath}`);
  for (const row of rows) {
    console.log(
      `${row.name}: duration=${row.durationMinutes} failure=${row.failure} routes=${row.attempts.map((a) => a.routeCount).join(",")}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
