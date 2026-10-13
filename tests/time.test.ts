import { describe, expect, it } from "vitest";
import {
  formatArchiveDate,
  formatCalendarDate,
  formatFileDate,
  formatModifiedDate,
  formatMeetingMonthDay,
  formatMeetingTime,
  formatMeetingWeekday,
  localDate,
  nowInNewYork,
} from "../src/lib/time";

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

describe("formatMeetingTime and formatCalendarDate", () => {
  it("formats a time range in New York time, with one meridiem when both ends share it", () => {
    expect(formatMeetingTime(new Date("2026-09-29T23:00:00Z"), new Date("2026-09-30T00:30:00Z"))).toBe("7:00 to 8:30 pm");
    expect(formatMeetingTime(new Date("2026-09-29T23:00:00Z"), new Date("2026-09-30T03:30:00Z"))).toBe("7:00 to 11:30 pm");
  });

  it("shows both meridiems when the range crosses noon or midnight", () => {
    expect(formatMeetingTime(new Date("2026-01-28T16:00:00Z"), new Date("2026-01-28T17:30:00Z"))).toBe("11:00 am to 12:30 pm");
    expect(formatMeetingTime(new Date("2026-09-29T23:00:00Z"), new Date("2026-09-30T05:00:00Z"))).toBe("7:00 pm to 1:00 am");
  });

  it("uses standard time in winter", () => {
    expect(formatMeetingTime(new Date("2026-11-18T00:00:00Z"), new Date("2026-11-18T01:30:00Z"))).toBe("7:00 to 8:30 pm");
  });

  it("formats a bare calendar date in New York time", () => {
    expect(formatCalendarDate(new Date("2026-10-07T02:30:00Z"))).toBe("October 6, 2026");
  });
});

describe("formatMeetingWeekday and formatMeetingMonthDay", () => {
  it("give the two lines of the home lockup for the sample meeting", () => {
    const start = new Date("2026-09-29T23:00:00Z");
    expect(formatMeetingWeekday(start)).toBe("Tuesday");
    expect(formatMeetingMonthDay(start)).toBe("September 29");
  });

  it("use the New York calendar day at a UTC day boundary", () => {
    // 03:59:59 UTC on Wednesday, September 30 is still 11:59:59 pm on Tuesday, September 29 in Arlington (EDT).
    const lastSecond = new Date("2026-09-30T03:59:59Z");
    expect(formatMeetingWeekday(lastSecond)).toBe("Tuesday");
    expect(formatMeetingMonthDay(lastSecond)).toBe("September 29");
    const midnight = new Date("2026-09-30T04:00:00Z");
    expect(formatMeetingWeekday(midnight)).toBe("Wednesday");
    expect(formatMeetingMonthDay(midnight)).toBe("September 30");
  });

  it("cross a month boundary in standard time", () => {
    // EST is UTC-5: 04:59:59 UTC on December 1 is 11:59:59 pm on Monday, November 30.
    const lastSecond = new Date("2026-12-01T04:59:59Z");
    expect(formatMeetingWeekday(lastSecond)).toBe("Monday");
    expect(formatMeetingMonthDay(lastSecond)).toBe("November 30");
    const midnight = new Date("2026-12-01T05:00:00Z");
    expect(formatMeetingWeekday(midnight)).toBe("Tuesday");
    expect(formatMeetingMonthDay(midnight)).toBe("December 1");
  });

  it("stay on New Year's Eve until New York's midnight", () => {
    // 04:59:59 UTC on January 1, 2027 is still New Year's Eve in Arlington.
    const lastSecond = new Date("2027-01-01T04:59:59Z");
    expect(formatMeetingWeekday(lastSecond)).toBe("Thursday");
    expect(formatMeetingMonthDay(lastSecond)).toBe("December 31");
  });
});

describe("formatArchiveDate", () => {
  it("formats an exact date and a month-only date", () => {
    expect(formatArchiveDate("2026-06-24")).toBe("June 24, 2026");
    expect(formatArchiveDate("2023-04-01", true)).toBe("April 2023");
  });
});

describe("formatFileDate", () => {
  const base = { id: "1", name: "x", mimeType: "a", url: "u", isFolder: false, path: [] as string[] };

  it("uses the parsed meeting date, with a full-date datetime when exact", () => {
    const f = { ...base, modifiedTime: "2026-01-01T00:00:00Z", meetingDate: "2026-06-24", approximate: false };
    expect(formatFileDate(f)).toEqual({ text: "June 24, 2026", datetime: "2026-06-24", kind: "document" });
  });

  it("gives an approximate date as month and year with a YYYY-MM datetime", () => {
    const f = { ...base, modifiedTime: "2026-01-01T00:00:00Z", meetingDate: "2023-04-01", approximate: true };
    expect(formatFileDate(f)).toEqual({ text: "April 2023", datetime: "2023-04", kind: "document" });
  });

  it("falls back to the New York modified date", () => {
    const f = { ...base, modifiedTime: "2026-10-07T02:30:00Z" };
    expect(formatFileDate(f)).toEqual({ text: "October 6, 2026", datetime: "2026-10-07T02:30:00Z", kind: "modified" });
  });

  it("returns undefined for an invalid timestamp instead of throwing", () => {
    expect(formatFileDate({ ...base, modifiedTime: "not a date" })).toBeUndefined();
    expect(formatFileDate({ ...base, modifiedTime: "" })).toBeUndefined();
    expect(formatModifiedDate({ ...base, modifiedTime: "garbage" })).toBeUndefined();
  });
});
