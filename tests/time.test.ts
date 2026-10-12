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

describe("formatMeetingDate and formatMeetingTime", () => {
  const start = new Date("2026-09-29T23:00:00Z");
  const end = new Date("2026-09-30T00:30:00Z");

  it("splits the range into a date and a time", async () => {
    const { formatMeetingDate, formatMeetingTime } = await import("../src/lib/time");
    expect(formatMeetingDate(start)).toBe("Tuesday, September 29, 2026");
    expect(formatMeetingTime(start, end)).toBe("7:00 to 8:30 pm");
  });

  it("formats a bare calendar date in New York time", async () => {
    const { formatCalendarDate } = await import("../src/lib/time");
    expect(formatCalendarDate(new Date("2026-10-07T02:30:00Z"))).toBe("October 6, 2026");
  });
});

describe("formatMeetingWeekday and formatMeetingMonthDay", () => {
  it("give the two lines of the home lockup for the sample meeting", async () => {
    const { formatMeetingWeekday, formatMeetingMonthDay } = await import("../src/lib/time");
    const start = new Date("2026-09-29T23:00:00Z");
    expect(formatMeetingWeekday(start)).toBe("Tuesday");
    expect(formatMeetingMonthDay(start)).toBe("September 29");
  });

  it("use the New York calendar day at a UTC day boundary", async () => {
    const { formatMeetingWeekday, formatMeetingMonthDay } = await import("../src/lib/time");
    // 03:59:59 UTC on Wednesday, September 30 is still 11:59:59 pm on Tuesday, September 29 in Arlington (EDT).
    const lastSecond = new Date("2026-09-30T03:59:59Z");
    expect(formatMeetingWeekday(lastSecond)).toBe("Tuesday");
    expect(formatMeetingMonthDay(lastSecond)).toBe("September 29");
    const midnight = new Date("2026-09-30T04:00:00Z");
    expect(formatMeetingWeekday(midnight)).toBe("Wednesday");
    expect(formatMeetingMonthDay(midnight)).toBe("September 30");
  });

  it("cross a month boundary in standard time", async () => {
    const { formatMeetingWeekday, formatMeetingMonthDay } = await import("../src/lib/time");
    // EST is UTC-5: 04:59:59 UTC on December 1 is 11:59:59 pm on Monday, November 30.
    const lastSecond = new Date("2026-12-01T04:59:59Z");
    expect(formatMeetingWeekday(lastSecond)).toBe("Monday");
    expect(formatMeetingMonthDay(lastSecond)).toBe("November 30");
    const midnight = new Date("2026-12-01T05:00:00Z");
    expect(formatMeetingWeekday(midnight)).toBe("Tuesday");
    expect(formatMeetingMonthDay(midnight)).toBe("December 1");
  });

  it("are what formatMeetingDate is composed from, with the New York year", async () => {
    const { formatMeetingDate, formatMeetingWeekday, formatMeetingMonthDay } = await import("../src/lib/time");
    const start = new Date("2026-09-29T23:00:00Z");
    expect(formatMeetingDate(start)).toBe("Tuesday, September 29, 2026");
    expect(formatMeetingDate(start)).toBe(`${formatMeetingWeekday(start)}, ${formatMeetingMonthDay(start)}, 2026`);
    // 04:59:59 UTC on January 1, 2027 is still New Year's Eve in Arlington.
    expect(formatMeetingDate(new Date("2027-01-01T04:59:59Z"))).toBe("Thursday, December 31, 2026");
  });
});
