process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addTokyoCalendarDays,
  buildDemoCalendarRecords,
  mergeJournalWithDemo,
} from "../src/features/home/demo-calendar-stickers";
import type { DateMemory } from "../src/client/hooks/use-date-journal";

describe("demo calendar stickers", () => {
  it("places five samples on days before the anchor", () => {
    const rows = buildDemoCalendarRecords("2026-09-21");
    assert.equal(rows.length, 5);
    assert.deepEqual(
      rows.map((r) => r.date),
      ["2026-09-03", "2026-09-08", "2026-09-14", "2026-09-18", "2026-09-19"],
    );
    for (const row of rows) {
      assert.equal(row.demo, true);
      assert.ok(row.title.length > 0);
      assert.ok(row.note.length > 0);
    }
  });

  it("rejects invalid anchors", () => {
    assert.deepEqual(buildDemoCalendarRecords("not-a-date"), []);
  });

  it("lets real records win on the same date", () => {
    const demo = buildDemoCalendarRecords("2026-09-21");
    const real: DateMemory[] = [
      {
        date: "2026-09-14",
        title: "実記録",
        note: "本物",
        mood: "relaxed",
        sessionId: "ses_real",
      },
    ];
    const merged = mergeJournalWithDemo(real, demo);
    const hit = merged.find((r) => r.date === "2026-09-14");
    assert.ok(hit);
    assert.equal(hit.title, "実記録");
    assert.equal(hit.demo, undefined);
    assert.equal(hit.sessionId, "ses_real");
    assert.equal(merged.filter((r) => r.demo).length, 4);
  });

  it("addTokyoCalendarDays crosses month boundaries", () => {
    assert.equal(addTokyoCalendarDays("2026-10-01", -1), "2026-09-30");
  });
});
