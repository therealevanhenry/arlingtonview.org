import { describe, expect, it } from "vitest";
import { formatMeetingRange, localDate, nowInNewYork } from "../src/lib/time";

describe("formatMeetingRange", () => {
  it("formats a range in New York time", () => {
    expect(
      formatMeetingRange(new Date("2026-09-23T23:00:00Z"), new Date("2026-09-24T00:30:00Z")),
    ).toBe("Wednesday, September 23, 2026, 7:00 to 8:30 pm");
  });

  it("shows both meridiems when the range crosses noon", () => {
    expect(
      formatMeetingRange(new Date("2026-01-28T16:00:00Z"), new Date("2026-01-28T17:30:00Z")),
    ).toBe("Wednesday, January 28, 2026, 11:00 am to 12:30 pm");
  });

  it("uses standard time in winter", () => {
    expect(
      formatMeetingRange(new Date("2026-11-18T00:00:00Z"), new Date("2026-11-18T01:30:00Z")),
    ).toBe("Tuesday, November 17, 2026, 7:00 to 8:30 pm");
  });
});

describe("localDate", () => {
  it("returns the New York calendar date", () => {
    expect(localDate(new Date("2026-09-24T00:30:00Z"))).toBe("2026-09-23");
    expect(localDate(new Date("2026-01-29T00:00:00Z"))).toBe("2026-01-28");
    expect(localDate(new Date("2026-07-01T03:59:59Z"))).toBe("2026-06-30");
    expect(localDate(new Date("2026-07-01T04:00:00Z"))).toBe("2026-07-01");
  });
});

describe("nowInNewYork", () => {
  it("returns a valid Date near the system clock", () => {
    expect(Math.abs(nowInNewYork().getTime() - Date.now())).toBeLessThan(5000);
  });
});
