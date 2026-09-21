process.env.APP_RUNTIME = "MOCK";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toTokyoParts } from "../src/lib/time";
import {
  assessSpotOpening,
  expandRegularIntervals,
  parseCurrentOpeningHours,
  parseCurrentDatedHours,
  parsePlaceHours,
} from "../src/server/providers/placeFacts";

const HOLIDAY_MON = "2026-09-21"; // 敬老の日
const TUE = "2026-09-22";
const FAR = "2026-10-15"; // current の約1週間外
const FETCH = "2026-09-21";

function stay(date: string, start = "15:00", end = "15:50") {
  return {
    startAt: `${date}T${start}:00+09:00`,
    endAt: `${date}T${end}:00+09:00`,
  };
}

describe("opening hours: current coverage vs regular fallback", () => {
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

  it("OPEN when regular skips Monday but current has holiday Monday", () => {
    const regular = parsePlaceHours({
      periods: [
        { open: { day: 0, hour: 10 }, close: { day: 0, hour: 18 } },
        { open: { day: 2, hour: 10 }, close: { day: 2, hour: 18 } },
      ],
    });
    const current = parseCurrentOpeningHours(
      {
        periods: [
          {
            open: { day: 1, hour: 10, date: { year: 2026, month: 9, day: 21 } },
            close: { day: 1, hour: 18, date: { year: 2026, month: 9, day: 21 } },
          },
        ],
        specialDays: [{ date: { year: 2026, month: 9, day: 21 } }],
      },
      FETCH,
    );
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(assessSpotOpening({ regular, current }, startAt, endAt, toTokyoParts), "OPEN");
  });

  it("CLOSED on special day inside coverage with no periods (temp closed) — does not use regular OPEN", () => {
    const regular = [{ days: [1], open: "10:00", close: "18:00" }]; // Monday normally open
    const current = parseCurrentOpeningHours(
      {
        periods: [
          // Only Tuesday present in the 7-day window
          {
            open: { day: 2, hour: 10, date: { year: 2026, month: 9, day: 22 } },
            close: { day: 2, hour: 18, date: { year: 2026, month: 9, day: 22 } },
          },
        ],
        specialDays: [{ date: { year: 2026, month: 9, day: 21 } }],
      },
      FETCH,
    );
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(
      assessSpotOpening({ regular, current }, startAt, endAt, toTokyoParts),
      "CLOSED",
      "inside coverage without a Monday period must not fall back to regular",
    );
  });

  it("falls back to regular when plan date is outside current coverage window", () => {
    const regular = [{ days: [4], open: "10:00", close: "18:00" }]; // Thursday
    const current = parseCurrentOpeningHours(
      {
        periods: [
          {
            open: { day: 1, hour: 9, date: { year: 2026, month: 9, day: 21 } },
            close: { day: 1, hour: 12, date: { year: 2026, month: 9, day: 21 } },
          },
        ],
      },
      FETCH,
    );
    const { startAt, endAt } = stay(FAR);
    assert.equal(toTokyoParts(startAt).weekday, 4);
    assert.equal(assessSpotOpening({ regular, current }, startAt, endAt, toTokyoParts), "OPEN");
  });

  it("neverOpen (empty periods) is CLOSED inside coverage", () => {
    const regular = [{ days: [1], open: "10:00", close: "18:00" }];
    const current = parseCurrentOpeningHours({ periods: [] }, FETCH);
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(assessSpotOpening({ regular, current }, startAt, endAt, toTokyoParts), "CLOSED");
  });

  it("UNKNOWN when neither regular nor current has data", () => {
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(assessSpotOpening({ regular: [], current: null }, startAt, endAt, toTokyoParts), "UNKNOWN");
  });

  it("UNKNOWN when current periods lack dates (incomplete) — not CLOSED via missing date alone", () => {
    const regular = [{ days: [1], open: "10:00", close: "18:00" }];
    const current = parseCurrentOpeningHours(
      {
        periods: [
          // weekday-only points without calendar date — not usable as dated current
          { open: { day: 1, hour: 10 }, close: { day: 1, hour: 18 } },
        ],
      },
      FETCH,
    );
    assert.equal(current?.incomplete, true);
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(
      assessSpotOpening({ regular, current }, startAt, endAt, toTokyoParts),
      "UNKNOWN",
    );
  });

  it("absent currentOpeningHours falls back to regular (null snapshot)", () => {
    const regular = [{ days: [1], open: "10:00", close: "18:00" }];
    const { startAt, endAt } = stay(HOLIDAY_MON);
    assert.equal(parseCurrentOpeningHours(null, FETCH), null);
    assert.equal(
      assessSpotOpening({ regular, current: null }, startAt, endAt, toTokyoParts),
      "OPEN",
    );
  });
});

describe("opening hours: multi-interval and overnight", () => {
  it("keeps lunch + dinner split and rejects stay across the break", () => {
    const regular = [
      { days: [1], open: "11:00", close: "14:00" },
      { days: [1], open: "17:00", close: "22:00" },
    ];
    const lunch = stay(HOLIDAY_MON, "12:00", "13:00");
    const dinner = stay(HOLIDAY_MON, "18:00", "19:00");
    const across = stay(HOLIDAY_MON, "13:00", "18:00");
    assert.equal(assessSpotOpening({ regular }, lunch.startAt, lunch.endAt, toTokyoParts), "OPEN");
    assert.equal(assessSpotOpening({ regular }, dinner.startAt, dinner.endAt, toTokyoParts), "OPEN");
    assert.equal(assessSpotOpening({ regular }, across.startAt, across.endAt, toTokyoParts), "CLOSED");
  });

  it("handles overnight 18:00–02:00", () => {
    const regular = [{ days: [5], open: "18:00", close: "02:00" }]; // Friday night
    const fri = "2026-09-25"; // Friday
    const sat = "2026-09-26";
    assert.equal(
      assessSpotOpening({ regular }, `${fri}T20:00:00+09:00`, `${fri}T21:00:00+09:00`, toTokyoParts),
      "OPEN",
    );
    assert.equal(
      assessSpotOpening({ regular }, `${sat}T00:30:00+09:00`, `${sat}T01:30:00+09:00`, toTokyoParts),
      "OPEN",
    );
    assert.equal(
      assessSpotOpening({ regular }, `${fri}T15:00:00+09:00`, `${fri}T16:00:00+09:00`, toTokyoParts),
      "CLOSED",
    );
  });

  it("24h always-open (no close) is OPEN", () => {
    const regular = parsePlaceHours({
      periods: [{ open: { day: 0, hour: 0, minute: 0 } }],
    });
    assert.ok(regular[0]?.alwaysOpen);
    const { startAt, endAt } = stay("2026-09-20", "03:00", "04:00");
    assert.equal(assessSpotOpening({ regular }, startAt, endAt, toTokyoParts), "OPEN");
  });

  it("truncated close yields UNKNOWN when stay ends after truncated boundary", () => {
    const current = parseCurrentOpeningHours(
      {
        periods: [
          {
            open: { day: 1, hour: 10, date: { year: 2026, month: 9, day: 21 } },
            close: {
              day: 1,
              hour: 23,
              minute: 59,
              date: { year: 2026, month: 9, day: 21 },
              truncated: true,
            },
          },
        ],
      },
      FETCH,
    );
    // Stay ends after truncated close → UNKNOWN (cannot prove open beyond window)
    assert.equal(
      assessSpotOpening(
        { regular: [], current },
        `${HOLIDAY_MON}T22:00:00+09:00`,
        `${TUE}T01:00:00+09:00`,
        toTokyoParts,
      ),
      "UNKNOWN",
    );
  });

  it("expandRegularIntervals returns multiple same-day windows", () => {
    const iv = expandRegularIntervals(
      [
        { days: [1], open: "11:00", close: "14:00" },
        { days: [1], open: "17:00", close: "22:00" },
      ],
      `${HOLIDAY_MON}T12:00:00+09:00`,
      toTokyoParts,
    );
    assert.equal(iv.length, 2);
  });
});
