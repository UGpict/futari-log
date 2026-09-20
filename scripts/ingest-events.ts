process.env.ENABLE_DEMO_CONTROLS ??= "true";

import { ingestEvents } from "../src/server/catalog/ingest";
import { listEvents } from "../src/server/catalog/repo";

async function main() {
  const result = await ingestEvents({ owner: "manual-script" });
  const listed = result.ok
    ? (await listEvents({ dateTokyo: undefined, genre: "展覧会" })).slice(0, 10).map((e) => ({
        id: e.id,
        title: e.title,
        venueName: e.venueName,
        dateStart: e.dateStart,
        confirmation: e.confirmation,
        planEligible: e.planEligible === true,
        hasCoords: e.lat != null && e.lng != null,
        fields: {
          title: e.fields.title.confirmation,
          periodStart: e.fields.periodStart.confirmation,
          periodEnd: e.fields.periodEnd.confirmation,
          hours: e.fields.hours.confirmation,
          closedDays: e.fields.closedDays.confirmation,
          venue: e.fields.venue.confirmation,
          fee: e.fields.fee.confirmation,
        },
      }))
    : [];
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        runId: result.runId,
        status: result.status,
        saved: result.saved,
        error: result.error,
        listed,
      },
      null,
      2,
    ),
  );
  process.exit(result.ok ? 0 : 2);
}

void main();
