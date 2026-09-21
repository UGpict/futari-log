process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toTokyoParts } from "../src/lib/time";
import {
  assessSpotOpening,
  parseCurrentDatedHours,
  parsePlaceHours,
} from "../src/server/providers/placeFacts";

const HOLIDAY_MON = "2026-09-21"; // 敬老の日
const TUE = "2026-09-22";
const FAR = "2026-10-15"; // current の約1週間外

function stay(date: string, start = "15:00", end = "15:50") {
  return {
    startAt: `${date}T${start}:00+09:00`,
    endAt: `${date}T${end}:00+09:00`,
  };
}

describe("opening hours: current date match then regular", () => {
  it("parses currentOpeningHours periods that include calendar dates", () => {
    const dated = parseCurrentDatedHours({
      periods: [
        {
          open: { day: 1, hour: 10, minute: 0, date: { year: 2026, month: 9, day: 21 } },
          close: { day: 1, hour: 18, minute: 0, date: { year: 2026, month: 9, day: 21 } },
        },
      ],
    });
    assert.deepEqual(dated, { "2026-09-21": { open: "10:00", close: "18:00" } });
  });

  it("ignores current periods without date (does not mix into weekday rules)", () => {
    const dated = parseCurrentDatedHours({
      periods: [{ open: { day: 1, hour: 10, minute: 0 }, close: { day: 1, hour: 18, minute: 0 } }],
    });
    assert.deepEqual(dated, {});
  });

  it("OPEN when regular skips Monday but dated has holiday Monday", () => {
    const regular = parsePlaceHours({
      periods: [
        { open: { day: 0, hour: 10 }, close: { day: 0, hour: 18 } },
        { open: { day: 2, hour: 10 }, close: { day: 2, hour: 18 } },
      ],
    });
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(
      assessSpotOpening(
        { regular, dated: { [HOLIDAY_MON]: { open: "10:00", close: "18:00" } } },
        startAt,
        endAt,
        toTokyoParts,
      ),
      "OPEN",
    );
  });

  it("CLOSED when regular skips Monday and dated has no matching day", () => {
    const regular = parsePlaceHours({
      periods: [
        { open: { day: 0, hour: 10 }, close: { day: 0, hour: 18 } },
        { open: { day: 2, hour: 10 }, close: { day: 2, hour: 18 } },
      ],
    });
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(
      assessSpotOpening(
        { regular, dated: { [TUE]: { open: "10:00", close: "18:00" } } },
        startAt,
        endAt,
        toTokyoParts,
      ),
      "CLOSED",
    );
  });

  it("falls back to regular when plan date is outside current dated keys (stale cache safe)", () => {
    const regular = parsePlaceHours({
      periods: [{ open: { day: 3, hour: 10 }, close: { day: 3, hour: 18 } }], // Wed
    });
    // Cached current only covers late September; October plan must not use those windows by weekday.
    const { startAt, endAt } = stay(FAR); // Thursday 2026-10-15
    assert.equal(toTokyoParts(startAt).weekday, 4);
    assert.equal(
      assessSpotOpening(
        {
          regular,
          dated: {
            "2026-09-21": { open: "10:00", close: "18:00" },
            "2026-09-22": { open: "10:00", close: "18:00" },
          },
        },
        startAt,
        endAt,
        toTokyoParts,
      ),
      "CLOSED", // Thursday not in regular → CLOSED via fallback, not Monday's dated window
    );
  });

  it("uses regular OPEN when date is outside current range but weekday matches", () => {
    const regular = [{ days: [4], open: "10:00", close: "18:00" }];
    const { startAt, endAt } = stay(FAR);
    assert.equal(
      assessSpotOpening(
        { regular, dated: { "2026-09-21": { open: "09:00", close: "12:00" } } },
        startAt,
        endAt,
        toTokyoParts,
      ),
      "OPEN",
    );
  });

  it("UNKNOWN when neither regular nor dated has data", () => {
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(assessSpotOpening({ regular: [], dated: {} }, startAt, endAt, toTokyoParts), "UNKNOWN");
  });
});
