import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addToGoogleCalendarUrl,
  loadCalendar,
  nextMeeting,
  parseIcs,
  past,
  subscribeLinks,
  upcoming,
  type Meeting,
} from "../src/lib/calendar";
import type { Settings } from "../src/lib/settings";
import { localDate } from "../src/lib/time";

const fixture = (name: string): string => readFileSync(`tests/fixtures/${name}`, "utf8");
const ics = fixture("avca.ics");
const emptyIcs = fixture("empty.ics");
const liveIcs = fixture("avca-live-shape.ics");
const now = new Date("2026-10-06T14:00:00-04:00");

const CALENDAR_ID =
  "c_1a4eb9b26454828fe282cee5a45157d3c69bc23e03bf9a1646bbb02e0386380e@group.calendar.google.com";
const settings = { calendarId: CALENDAR_ID } as Settings;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseIcs (synthetic fixture)", () => {
  it("skips EXDATE months", () => {
    const m = parseIcs(ics, now).map((x) => x.start.toISOString().slice(0, 10));
    expect(m).not.toContain("2026-07-22");
    expect(m).not.toContain("2026-08-26");
  });

  it("applies the moved instance", () => {
    const m = parseIcs(ics, now).find((x) => x.start.toISOString().startsWith("2026-09-29"));
    expect(m?.isVirtual).toBe(true);
    expect(m?.agendaUrl).toMatch(/docs.google.com/);
    expect(
      parseIcs(ics, now).some((x) => x.start.toISOString().startsWith("2026-09-23")),
    ).toBe(false);
  });

  it("drops cancelled events", () => {
    expect(
      parseIcs(ics, now).some((x) => x.start.toISOString().startsWith("2026-10-14")),
    ).toBe(false);
  });

  it("keeps 7 pm local across the DST change", () => {
    const jan = parseIcs(ics, now).find((x) => localDate(x.start) === "2026-01-28");
    expect(jan?.start.toISOString()).toBe("2026-01-29T00:00:00.000Z");
    expect(jan?.end.toISOString()).toBe("2026-01-29T01:30:00.000Z");
    const oct = parseIcs(ics, now).find((x) => localDate(x.start) === "2026-10-28");
    expect(oct?.start.toISOString()).toBe("2026-10-28T23:00:00.000Z");
  });

  it("is sorted ascending and has no description field", () => {
    const meetings = parseIcs(ics, now);
    const times = meetings.map((x) => x.start.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const m of meetings) expect(m).not.toHaveProperty("description");
    expect(JSON.stringify(meetings)).not.toContain("meet.google.com");
  });

  it("drops a location that contains a URL and marks the meeting virtual", () => {
    const withUrl = ics.replace("LOCATION:Arlington Hall", "LOCATION:Room 2\\, https://zoom.us/j/123");
    const m = parseIcs(withUrl, now).find((x) => localDate(x.start) === "2026-10-28");
    expect(m?.location).toBeUndefined();
    expect(m?.isVirtual).toBe(true);
    expect(JSON.stringify(parseIcs(withUrl, now))).not.toContain("zoom.us");
  });

  it("keeps a physical location and marks the meeting not virtual", () => {
    const m = parseIcs(ics, now).find((x) => localDate(x.start) === "2026-10-28");
    expect(m?.location).toBe("Arlington Hall");
    expect(m?.isVirtual).toBe(false);
  });
});

describe("selection helpers", () => {
  it("next meeting is the current one while it is in progress", () => {
    const during = new Date("2026-10-28T23:30:00Z"); // 7:30 pm EDT
    expect(nextMeeting(parseIcs(ics, during), during)?.start.toISOString()).toMatch(/2026-10-28/);
  });

  it("returns undefined next meeting for an empty calendar", () => {
    expect(nextMeeting(parseIcs(emptyIcs, now), now)).toBeUndefined();
  });

  it("upcoming and past partition around now", () => {
    const meetings = parseIcs(ics, now);
    const up = upcoming(meetings, now, 3);
    expect(up).toHaveLength(3);
    expect(up.every((m) => m.end > now)).toBe(true);
    expect(up[0]?.start.getTime()).toBeLessThan(up[1]!.start.getTime());
    const pa = past(meetings, now);
    expect(pa.every((m) => m.end <= now)).toBe(true);
    expect(pa[0]!.start.getTime()).toBeGreaterThan(pa[1]!.start.getTime());
    expect(pa.length + meetings.filter((m) => m.end > now).length).toBe(meetings.length);
  });
});

describe("parseIcs (live-shape fixture)", () => {
  const liveNow = new Date("2026-10-12T12:00:00-04:00");
  const meetings = parseIcs(liveIcs, liveNow);
  const dates = meetings.map((m) => localDate(m.start));

  it("returns exactly the expected meetings in order", () => {
    expect(meetings).toHaveLength(13);
    expect(dates).toEqual([
      "2026-09-29", "2026-10-20", "2026-11-17", "2026-12-15", "2027-01-19", "2027-02-23",
      "2027-03-30", "2027-04-27", "2027-05-25", "2027-06-29", "2027-07-27", "2027-08-31",
      "2027-09-28",
    ]);
  });

  it("never shows moved-from dates and shows 2026-09-29 once", () => {
    for (const d of ["2026-10-27", "2026-11-24", "2026-12-29", "2027-01-26"]) {
      expect(dates).not.toContain(d);
    }
    expect(dates.filter((d) => d === "2026-09-29")).toHaveLength(1);
  });

  it("keeps 7:00 to 8:30 pm New York across the DST change", () => {
    const hm = (d: Date) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
      }).format(d);
    for (const m of meetings) {
      expect(hm(m.start)).toBe("19:00");
      expect(hm(m.end)).toBe("20:30");
    }
    const byDate = (d: string) => meetings.find((m) => localDate(m.start) === d);
    expect(byDate("2026-11-17")?.start.toISOString()).toBe("2026-11-18T00:00:00.000Z");
    expect(byDate("2027-03-30")?.start.toISOString()).toBe("2027-03-30T23:00:00.000Z");
  });

  it("selects 2026-10-20 as next and marks every meeting virtual", () => {
    expect(localDate(nextMeeting(meetings, liveNow)!.start)).toBe("2026-10-20");
    expect(meetings.every((m) => m.isVirtual)).toBe(true);
  });

  it("has no agendaUrl and leaks no conferencing link", () => {
    expect(meetings.some((m) => m.agendaUrl !== undefined)).toBe(false);
    expect(JSON.stringify(meetings)).not.toContain("meet.google.com");
    for (const m of meetings) expect(m).not.toHaveProperty("description");
  });
});

describe("links", () => {
  it("subscribeLinks reproduces the owner's subscribe link", () => {
    const { google, ics: icsUrl } = subscribeLinks(CALENDAR_ID);
    expect(google).toBe(
      "https://calendar.google.com/calendar/u/0?cid=Y18xYTRlYjliMjY0NTQ4MjhmZTI4MmNlZTVhNDUxNTdkM2M2OWJjMjNlMDNiZjlhMTY0NmJiYjAyZTAzODYzODBlQGdyb3VwLmNhbGVuZGFyLmdvb2dsZS5jb20",
    );
    expect(icsUrl).toBe(
      "https://calendar.google.com/calendar/ical/c_1a4eb9b26454828fe282cee5a45157d3c69bc23e03bf9a1646bbb02e0386380e%40group.calendar.google.com/public/basic.ics",
    );
  });

  it("addToGoogleCalendarUrl builds a TEMPLATE url without description", () => {
    const m: Meeting = {
      uid: "u",
      start: new Date("2026-09-24T00:00:00Z"),
      end: new Date("2026-09-24T01:30:00Z"),
      title: "AVCA Monthly Meeting",
      location: "Arlington Hall",
      isVirtual: false,
    };
    const url = new URL(addToGoogleCalendarUrl(m));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("AVCA Monthly Meeting");
    expect(url.searchParams.get("dates")).toBe("20260924T000000Z/20260924T013000Z");
    expect(url.searchParams.get("location")).toBe("Arlington Hall");
    expect(url.searchParams.has("details")).toBe(false);
    const { location: _omit, ...noLocation } = m;
    expect(new URL(addToGoogleCalendarUrl(noLocation)).searchParams.has("location")).toBe(false);
  });
});

describe("loadCalendar", () => {
  it("reports ok:false on 404 without throwing", async () => {
    vi.stubEnv("OFFLINE", "");
    const r = await loadCalendar(settings, now, async () => new Response("", { status: 404 }));
    expect(r.ok).toBe(false);
  });

  it("returns meetings on a 200", async () => {
    vi.stubEnv("OFFLINE", "");
    const r = await loadCalendar(settings, now, async () => new Response(ics, { status: 200 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.meetings.length).toBeGreaterThan(0);
  });

  it("returns ok:false without calling fetch when OFFLINE=1", async () => {
    vi.stubEnv("OFFLINE", "1");
    const fetchImpl = vi.fn(async () => new Response(ics));
    const r = await loadCalendar(settings, now, fetchImpl);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns ok:false without calling fetch when calendarId is blank", async () => {
    vi.stubEnv("OFFLINE", "");
    const fetchImpl = vi.fn(async () => new Response(ics));
    const r = await loadCalendar({ calendarId: "  " } as Settings, now, fetchImpl);
    expect(r.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns ok:false when fetch rejects", async () => {
    vi.stubEnv("OFFLINE", "");
    const r = await loadCalendar(settings, now, async () => {
      throw new TypeError("network down");
    });
    expect(r.ok).toBe(false);
  });

  it("returns ok:false on an unparseable body and does not echo it", async () => {
    vi.stubEnv("OFFLINE", "");
    const r = await loadCalendar(
      settings,
      now,
      async () => new Response("<html>SECRET-BODY</html>", { status: 200 }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).not.toContain("SECRET-BODY");
  });

  it("returns ok:false on timeout", async () => {
    vi.stubEnv("OFFLINE", "");
    const r = await loadCalendar(
      settings,
      now,
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          (init as RequestInit).signal!.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
        }),
      20,
    );
    expect(r.ok).toBe(false);
  });
});

const wrap = (...events: string[]): string =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AVCA//Test//EN", ...events, "END:VCALENDAR"].join("\r\n");
const vevent = (uid: string, ...lines: string[]): string =>
  ["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20250901T000000Z", ...lines, "SUMMARY:Test", "END:VEVENT"].join("\r\n");

describe("parseIcs window, all-day events, and default duration", () => {
  const winNow = new Date("2026-10-06T18:00:00Z");

  it("applies [now - 2y, now + 1y] to standalone events", () => {
    const body = wrap(
      vevent("before", "DTSTART:20241006T170000Z", "DTEND:20241006T180000Z"),
      vevent("after-from", "DTSTART:20241006T190000Z", "DTEND:20241006T200000Z"),
      vevent("before-to", "DTSTART:20271006T170000Z", "DTEND:20271006T180000Z"),
      vevent("after-to", "DTSTART:20271006T190000Z", "DTEND:20271006T200000Z"),
    );
    expect(parseIcs(body, winNow).map((m) => m.uid)).toEqual(["after-from", "before-to"]);
  });

  it("skips all-day events, standalone and recurring", () => {
    const body = wrap(
      vevent("holiday", "DTSTART;VALUE=DATE:20261225", "DTEND;VALUE=DATE:20261226"),
      vevent("yearly", "DTSTART;VALUE=DATE:20260101", "DTEND;VALUE=DATE:20260102", "RRULE:FREQ=MONTHLY"),
      vevent("meeting", "DTSTART:20261020T230000Z", "DTEND:20261021T003000Z"),
    );
    expect(parseIcs(body, winNow).map((m) => m.uid)).toEqual(["meeting"]);
  });

  it("gives a timed event with no DTEND a 90-minute duration", () => {
    const body = wrap(vevent("open-ended", "DTSTART:20261020T230000Z"));
    const [m] = parseIcs(body, winNow);
    expect(m.end.getTime() - m.start.getTime()).toBe(90 * 60 * 1000);
  });
});

describe("parseIcs cancellations and empty futures", () => {
  it("drops a STATUS:CANCELLED override inside a recurring series and keeps the rest", () => {
    const body = wrap(
      vevent("series", "DTSTART:20261020T230000Z", "DTEND:20261021T003000Z", "RRULE:FREQ=MONTHLY;COUNT=3"),
      [
        "BEGIN:VEVENT",
        "UID:series",
        "DTSTAMP:20250901T000000Z",
        "RECURRENCE-ID:20261120T230000Z",
        "DTSTART:20261120T230000Z",
        "DTEND:20261121T003000Z",
        "STATUS:CANCELLED",
        "SUMMARY:Test",
        "END:VEVENT",
      ].join("\r\n"),
    );
    const dates = parseIcs(body, new Date("2026-10-06T18:00:00Z")).map((m) => m.start.toISOString().slice(0, 10));
    expect(dates).toEqual(["2026-10-20", "2026-12-20"]);
  });

  it("has no next meeting when every event is in the past", () => {
    const body = wrap(
      vevent("old-1", "DTSTART:20250120T230000Z", "DTEND:20250121T003000Z"),
      vevent("old-2", "DTSTART:20250220T230000Z", "DTEND:20250221T003000Z"),
    );
    const later = new Date("2026-10-06T18:00:00Z");
    const meetings = parseIcs(body, later);
    expect(meetings).toHaveLength(2);
    expect(nextMeeting(meetings, later)).toBeUndefined();
  });
});
