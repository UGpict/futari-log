import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getEnv } from "../src/config/env";
import { ROUTES_FIELD_MASK } from "../src/config/settings";

async function main() {
  const key = getEnv().googleMapsApiKey;
  if (!key) throw new Error("no key");
  const dep = new Date(Date.now() + 24 * 3600_000).toISOString();
  const cases = [
    {
      name: "tokyo",
      body: {
        origin: { location: { latLng: { latitude: 35.681236, longitude: 139.767125 } } },
        destination: { location: { latLng: { latitude: 35.689487, longitude: 139.691706 } } },
        travelMode: "TRANSIT",
        languageCode: "ja",
        regionCode: "JP",
        departureTime: dep,
      },
    },
    {
      name: "sf",
      body: {
        origin: { location: { latLng: { latitude: 37.7749, longitude: -122.4194 } } },
        destination: { location: { latLng: { latitude: 37.8199, longitude: -122.4783 } } },
        travelMode: "TRANSIT",
        languageCode: "en",
        departureTime: dep,
      },
    },
  ];
  const out: Record<string, unknown>[] = [];
  for (const c of cases) {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(c.body),
    });
    const text = await res.text();
    out.push({ name: c.name, status: res.status, body: text.slice(0, 500), departureTime: dep });
  }
  const path = resolve("docs/reports/routes-raw-transit.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("wrote", path);
  for (const row of out) console.log(row.name, row.status, String(row.body).slice(0, 120));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
