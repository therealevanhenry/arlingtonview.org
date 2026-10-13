import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addToGoogleCalendarUrl,
  loadCalendar,
  nextMeeting,
  parseCalendar,
  parseIcs,
  placeLabel,
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
    // Its description holds a Google Docs link and a join link: neither is read.
    expect(m).not.toHaveProperty("agendaUrl");
    expect(JSON.stringify(m)).not.toContain("docs.google.com");
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

  it("strips a URL out of the location and keeps the venue beside it", () => {
    const withUrl = ics.replace("LOCATION:Arlington Hall", "LOCATION:Room 2\\, https://zoom.us/j/123");
    const m = parseIcs(withUrl, now).find((x) => localDate(x.start) === "2026-10-28");
    expect(m?.location).toBe("Room 2");
    // The link that was stripped was a join link, so people can attend remotely: the meeting is virtual too.
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

  it("upcoming is the next n meetings that have not ended, in order", () => {
    const meetings = parseIcs(ics, now);
    const up = upcoming(meetings, now, 3);
    expect(up).toHaveLength(3);
    expect(up.every((m) => m.end > now)).toBe(true);
    expect(up[0]?.start.getTime()).toBeLessThan(up[1]!.start.getTime());
    expect(up[0]).toBe(nextMeeting(meetings, now));
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

  it("carries nothing from the description: no agenda link, no conferencing link, no description", () => {
    expect(JSON.stringify(meetings)).not.toContain("meet.google.com");
    for (const m of meetings) {
      expect(m).not.toHaveProperty("description");
      expect(m).not.toHaveProperty("agendaUrl");
      expect(Object.keys(m).sort()).toEqual(["end", "isVirtual", "start", "title", "uid"]);
    }
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

describe("the description is never read", () => {
  it("publishes no link, address, or text from it, whatever it holds", () => {
    const body = wrap(
      vevent(
        "described",
        "DTSTART:20261020T230000Z",
        "DTEND:20261021T003000Z",
        "LOCATION:Carver Community Center",
        "DESCRIPTION:Agenda: https://docs.google.com/document/d/UNVETTED/edit\\nRecording https://drive.google.com/file/d/RECORDING/view\\nJoin https://meet.google.com/abc-defg-hij\\nQuestions to a.resident@example.org\\nDESCRIPTION-ONLY-TEXT",
      ),
    );
    const [m] = parseIcs(body, new Date("2026-10-06T18:00:00Z"));
    expect(m).toEqual({
      uid: "described",
      start: new Date("2026-10-20T23:00:00Z"),
      end: new Date("2026-10-21T00:30:00Z"),
      title: "Test",
      location: "Carver Community Center",
      isVirtual: false,
    });
    const text = JSON.stringify(m);
    for (const leak of ["UNVETTED", "RECORDING", "docs.google.com", "drive.google.com", "meet.google.com", "example.org", "DESCRIPTION-ONLY-TEXT"]) {
      expect(text, leak).not.toContain(leak);
    }
    expect(addToGoogleCalendarUrl(m)).not.toMatch(/UNVETTED|RECORDING|details=/);
  });
});

describe("location, isVirtual, and placeLabel", () => {
  /** The meeting parsed from an event with this LOCATION (ICS-escaped here), or with none. */
  const at = (location?: string): Meeting => {
    const escaped = location?.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\;");
    const lines = ["DTSTART:20261020T230000Z", "DTEND:20261021T003000Z", ...(escaped === undefined ? [] : [`LOCATION:${escaped}`])];
    const [m] = parseIcs(wrap(vevent("place", ...lines)), new Date("2026-10-06T18:00:00Z"));
    return m;
  };

  it.each<[string, string | undefined, { location: string | undefined; isVirtual: boolean; label: string }]>([
    ["no location", undefined, { location: undefined, isVirtual: true, label: "Virtual meeting" }],
    ["a blank location", "   ", { location: undefined, isVirtual: true, label: "Virtual meeting" }],
    ["a bare join URL", "https://meet.google.com/abc-defg-hij", { location: undefined, isVirtual: true, label: "Virtual meeting" }],
    ["a join link written without a scheme", "zoom.us/j/1234567890?pwd=abc", { location: undefined, isVirtual: true, label: "Virtual meeting" }],
    ["Virtual", "Virtual", { location: "Virtual", isVirtual: true, label: "Virtual meeting" }],
    ["Google Meet", "Google Meet", { location: "Google Meet", isVirtual: true, label: "Virtual meeting" }],
    ["a virtual term followed by 'meeting', in any case", "ONLINE meeting", { location: "ONLINE meeting", isVirtual: true, label: "Virtual meeting" }],
    ["Zoom with its link", "Zoom: https://zoom.us/j/1234567890", { location: "Zoom", isVirtual: true, label: "Virtual meeting" }],
    ["a venue", "Carver Community Center", { location: "Carver Community Center", isVirtual: false, label: "Carver Community Center" }],
    [
      "a hybrid meeting: the venue is kept and the meeting is also virtual",
      "Carver Community Center (also on Zoom)",
      { location: "Carver Community Center (also on Zoom)", isVirtual: true, label: "Carver Community Center (also on Zoom)" },
    ],
    ["a venue described with the word meet", "Meet at Carver", { location: "Meet at Carver", isVirtual: true, label: "Meet at Carver" }],
    ["a room with a join link: the room is the place, and the meeting is virtual as well", "Room 2, https://zoom.us/j/123", { location: "Room 2", isVirtual: true, label: "Room 2" }],
    ["a room with a join link written without a scheme", "Room 2 (meet.google.com/abc-defg-hij)", { location: "Room 2", isVirtual: true, label: "Room 2" }],
    ["a room with a dial-in link", "Room 2; tel.meet/abc-defg-hij?pin=123", { location: "Room 2", isVirtual: true, label: "Room 2" }],
    ["an address with a map link: a link that is not a join link does not make a meeting virtual", "1415 S Queen St https://maps.example/x", { location: "1415 S Queen St", isVirtual: false, label: "1415 S Queen St" }],
    ["an address with a map link in parentheses", "1415 S Queen St (https://maps.example/x)", { location: "1415 S Queen St", isVirtual: false, label: "1415 S Queen St" }],
    ["a www link with no scheme", "Carver Community Center, www.example.org/carver", { location: "Carver Community Center", isVirtual: false, label: "Carver Community Center" }],
    ["a venue between a map link and a join link", "https://maps.example/x Carver Community Center; https://zoom.us/j/1", { location: "Carver Community Center", isVirtual: true, label: "Carver Community Center" }],
    ["a venue between two map links", "https://maps.example/x Carver Community Center; https://example.org/directions", { location: "Carver Community Center", isVirtual: false, label: "Carver Community Center" }],
    // An email address is stripped like a link (every address here is invented).
    ["a venue with a contact address", "Carver Community Center, questions to a.resident@example.org", { location: "Carver Community Center, questions to", isVirtual: false, label: "Carver Community Center, questions to" }],
    ["an address in parentheses", "Room 2 (a.resident@example.org)", { location: "Room 2", isVirtual: false, label: "Room 2" }],
    ["a mailto link", "Room 2, mailto:a.resident@example.org", { location: "Room 2", isVirtual: false, label: "Room 2" }],
    ["only an address", "x.y@gmail.com", { location: undefined, isVirtual: true, label: "Virtual meeting" }],
    ["an address and a join link", "Room 2 a.resident@example.org https://zoom.us/j/1", { location: "Room 2", isVirtual: true, label: "Room 2" }],
    ["the bare text gmail.com", "Carver (list on gmail.com)", { location: "Carver (list on)", isVirtual: false, label: "Carver (list on)" }],
    ["an asset-style name is not an address", "Room logo@2x.png", { location: "Room logo@2x.png", isVirtual: false, label: "Room logo@2x.png" }],
    ["whole words only: 'meeting' and 'zoomed' are not virtual terms", "Community Meeting Room, Zoomed-in Annex", { location: "Community Meeting Room, Zoomed-in Annex", isVirtual: false, label: "Community Meeting Room, Zoomed-in Annex" }],
  ])("%s", (_name, location, expected) => {
    const m = at(location);
    expect(m.location).toBe(expected.location);
    expect(m.isVirtual).toBe(expected.isVirtual);
    expect(placeLabel(m)).toBe(expected.label);
    expect(JSON.stringify(m)).not.toMatch(/https?:|zoom\.us|meet\.google\.com|tel\.meet|www\.|example\.org|gmail\.com|mailto/);
    expect(addToGoogleCalendarUrl(m)).not.toMatch(/zoom\.us|meet\.google\.com|example\.org|gmail\.com/);
  });

  it("placeLabel reads only the location text", () => {
    const base = { uid: "u", start: new Date(0), end: new Date(1), title: "t" };
    expect(placeLabel({ ...base, isVirtual: true })).toBe("Virtual meeting");
    expect(placeLabel({ ...base, isVirtual: true, location: "  zoom   meeting " })).toBe("Virtual meeting");
    expect(placeLabel({ ...base, isVirtual: true, location: "Meet" })).toBe("Virtual meeting");
    expect(placeLabel({ ...base, isVirtual: false, location: "Library" })).toBe("Library");
    expect(placeLabel({ ...base, isVirtual: true, location: "Virtual meeting room 3" })).toBe("Virtual meeting room 3");
  });
});

describe("an email address in a location is removed and noted, never printed or logged", () => {
  const noteNow = new Date("2026-10-06T18:00:00Z");
  const withLocation = (uid: string, start: string, end: string, location: string, ...extra: string[]) =>
    vevent(uid, `DTSTART:${start}`, `DTEND:${end}`, `LOCATION:${location.replace(/,/g, "\\,")}`, ...extra);

  it("notes each affected event once, by the date of its next meeting, without the address or the location", () => {
    const body = wrap(
      withLocation("one-off", "20261020T230000Z", "20261021T003000Z", "Carver Community Center, ask a.resident@example.org"),
      withLocation("clean", "20261117T000000Z", "20261117T013000Z", "Carver Community Center"),
      // A monthly series: many meetings, one event, one note (for the first meeting that has not ended).
      withLocation("series", "20260915T230000Z", "20260916T003000Z", "Room 2 b.neighbor@example.org", "RRULE:FREQ=MONTHLY;COUNT=6"),
    );
    const { meetings, notes } = parseCalendar(body, noteNow);
    expect(meetings.length).toBeGreaterThan(6);
    expect(notes).toEqual([
      "an email address was removed from the location of the meeting on 2026-10-15",
      "an email address was removed from the location of the meeting on 2026-10-20",
    ]);
    const everything = JSON.stringify({ meetings, notes });
    for (const leak of ["a.resident", "b.neighbor", "example.org", "@"]) expect(everything, leak).not.toContain(leak);
    expect(notes.join(" ")).not.toMatch(/Carver|Room 2/);
    expect(parseIcs(body, noteNow)).toEqual(meetings);
  });

  it("says nothing for an event whose meetings have all ended (their locations are not printed), or with nothing removed", () => {
    const body = wrap(
      withLocation("past", "20260915T230000Z", "20260916T003000Z", "Room 2 a.resident@example.org"),
      withLocation("clean", "20261020T230000Z", "20261021T003000Z", "Room 2, https://zoom.us/j/1"),
    );
    const { meetings, notes } = parseCalendar(body, noteNow);
    expect(notes).toEqual([]);
    expect(meetings.map((m) => m.location)).toEqual(["Room 2", "Room 2"]);
  });

  it("loadCalendar hands the notes on", async () => {
    vi.stubEnv("OFFLINE", "");
    const body = wrap(withLocation("one-off", "20261020T230000Z", "20261021T003000Z", "Carver, a.resident@example.org"));
    const r = await loadCalendar(settings, noteNow, async () => new Response(body, { status: 200 }));
    expect(r).toMatchObject({ ok: true, notes: ["an email address was removed from the location of the meeting on 2026-10-20"] });
    const clean = await loadCalendar(settings, noteNow, async () => new Response(ics, { status: 200 }));
    expect(clean.ok && clean.notes).toEqual([]);
  });
});

describe("the title is cleaned like the location (it goes into the Add to Google Calendar link)", () => {
  const titleNow = new Date("2026-10-06T18:00:00Z");
  const titled = (uid: string, start: string, end: string, summary: string, ...extra: string[]) =>
    ["BEGIN:VEVENT", `UID:${uid}`, "DTSTAMP:20250901T000000Z", `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${summary.replace(/,/g, "\\,")}`, ...extra, "END:VEVENT"].join("\r\n");
  const one = (summary: string) => parseCalendar(wrap(titled("t", "20261020T230000Z", "20261021T003000Z", summary)), titleNow);

  it.each<[string, string, string]>([
    ["a title with an address", "AVCA Monthly Meeting, RSVP to jane.roe@yahoo.example.org", "AVCA Monthly Meeting, RSVP to"],
    ["a title with an address in parentheses", "AVCA Monthly Meeting (a.resident@example.org)", "AVCA Monthly Meeting"],
    ["a title with a gmail address", "Budget session x.y@gmail.com", "Budget session"],
    ["a title with a join link", "AVCA Monthly Meeting https://zoom.us/j/1234567890?pwd=abc", "AVCA Monthly Meeting"],
    ["a title with a join link written without a scheme", "AVCA Monthly Meeting: meet.google.com/abc-defg-hij", "AVCA Monthly Meeting"],
    ["a title with a link of another kind", "Agenda at https://docs.google.com/document/d/UNVETTED/edit - AVCA", "Agenda at - AVCA"],
    ["a title that is only a link", "https://meet.google.com/abc-defg-hij", "Meeting"],
    ["a title that is only an address", "a.resident@example.org", "Meeting"],
  ])("%s", (_name, summary, expected) => {
    const { meetings, notes } = one(summary);
    expect(meetings[0].title).toBe(expected);
    expect(notes).toEqual(["the title of the meeting on 2026-10-20 was cleaned"]);
    const everything = `${JSON.stringify(meetings)} ${notes.join(" ")} ${addToGoogleCalendarUrl(meetings[0])} ${decodeURIComponent(addToGoogleCalendarUrl(meetings[0]))}`;
    expect(everything).not.toMatch(/@|%40|jane|resident|example\.org|gmail|zoom\.us|meet\.google|UNVETTED|https?:\/\/(?!calendar\.google\.com\/calendar\/render)/);
    // A join link in the title says nothing about where the meeting is held.
    expect(meetings[0].isVirtual).toBe(true);
    expect(meetings[0].location).toBeUndefined();
  });

  it.each(["AVCA Monthly Meeting", "AVCA Monthly Meeting - October", "Budget & Bylaws: a special session!", "Meet the candidates (Zoom or in person)", "Board @ 7"])(
    "leaves an ordinary title exactly as written, with no note: %s",
    (summary) => {
      const { meetings, notes } = one(summary);
      expect(meetings[0].title).toBe(summary);
      expect(notes).toEqual([]);
    },
  );

  it("still calls an event with no title Meeting, with no note", () => {
    const body = wrap(["BEGIN:VEVENT", "UID:t", "DTSTAMP:20250901T000000Z", "DTSTART:20261020T230000Z", "DTEND:20261021T003000Z", "END:VEVENT"].join("\r\n"));
    const { meetings, notes } = parseCalendar(body, titleNow);
    expect(meetings[0].title).toBe("Meeting");
    expect(notes).toEqual([]);
  });

  it("notes each affected event once (a series is one event), by its next meeting, beside any location note", () => {
    const body = wrap(
      titled("series", "20260915T230000Z", "20260916T003000Z", "AVCA Meeting zoom.us/j/1", "RRULE:FREQ=MONTHLY;COUNT=6", "LOCATION:Room 2 b.neighbor@example.org"),
      titled("past", "20260901T230000Z", "20260902T003000Z", "Old a.resident@example.org"),
      titled("clean", "20261117T000000Z", "20261117T013000Z", "AVCA Monthly Meeting"),
    );
    const { meetings, notes } = parseCalendar(body, titleNow);
    expect(notes).toEqual([
      "an email address was removed from the location of the meeting on 2026-10-15",
      "the title of the meeting on 2026-10-15 was cleaned",
    ]);
    expect(meetings.filter((m) => m.uid === "series").every((m) => m.title === "AVCA Meeting")).toBe(true);
    expect(meetings.find((m) => m.uid === "past")?.title).toBe("Old");
  });
});
