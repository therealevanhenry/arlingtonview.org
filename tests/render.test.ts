import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import MeetingList from "../src/components/MeetingList.astro";
import NextMeeting from "../src/components/NextMeeting.astro";
import QuickLinks from "../src/components/QuickLinks.astro";
import RecentFiles from "../src/components/RecentFiles.astro";
import type { Meeting } from "../src/lib/calendar";
import { nextMeeting } from "../src/lib/calendar";
import type { DriveFile } from "../src/lib/drive";
import { getSettings, type Settings } from "../src/lib/settings";

let container: AstroContainer;
let settings: Settings;

const sample: Meeting = {
  uid: "a",
  start: new Date("2026-09-29T23:00:00Z"),
  end: new Date("2026-09-30T00:30:00Z"),
  title: "AVCA General Meeting",
  isVirtual: true,
  agendaUrl: "https://docs.google.com/document/d/abc/edit",
};

beforeAll(async () => {
  container = await AstroContainer.create();
  settings = await getSettings();
});

const hrefs = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe("NextMeeting", () => {
  it("renders the standing rule when no meeting", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: undefined, settings } });
    expect(html).toContain(settings.meetingRule);
    expect(html).toContain(settings.virtualLinkNote);
    expect(html).toContain("Subscribe");
    expect(html).toContain("Next meeting");
    expect(html).not.toContain("meet.google.com");
  });

  it("renders the standing rule when the calendar is ok but only has past meetings", async () => {
    const past: Meeting[] = [{ ...sample, start: new Date("2026-06-24T23:00:00Z"), end: new Date("2026-06-25T00:30:00Z") }];
    const next = nextMeeting(past, new Date("2026-10-12T12:00:00Z"));
    expect(next).toBeUndefined();
    const html = await container.renderToString(NextMeeting, { props: { meeting: next, settings } });
    expect(html).toContain(settings.meetingRule);
    expect(html).toContain("Subscribe");
    expect(html).not.toContain("June");
    expect(html).not.toContain("<time");
  });

  it("omits subscribe links in the fallback when calendarId is blank", async () => {
    const html = await container.renderToString(NextMeeting, {
      props: { meeting: undefined, settings: { ...settings, calendarId: "  " } },
    });
    expect(html).toContain(settings.meetingRule);
    expect(html).not.toContain("calendar.google.com");
    expect(html).not.toContain("Subscribe");
  });

  it("shows date, time, Virtual, agenda link, and add-to-calendar", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    expect(html).toContain("Tuesday, September 29, 2026");
    expect(html).toContain("7:00 to 8:30 pm");
    expect(html).toMatch(/<time datetime="2026-09-29T23:00:00.000Z"[^>]*>Tuesday, September 29, 2026<\/time>/);
    expect(html).toContain("Virtual");
    expect(html).toContain(settings.virtualLinkNote);
    expect(html).toContain("Agenda");
    expect(html).toContain("calendar/render?action=TEMPLATE");
    expect(html).toContain("Add to Google Calendar");
    expect(html).toContain("Subscribe to calendar");
    expect(html).toContain("Calendar file (ICS)");
    expect(html).not.toContain("zoom.us");
    expect(html).not.toContain("meet.google.com");
    expect(html).not.toContain("target=");
    expect(html).not.toContain("<script");
  });

  it("prefers the agendaUrl prop and shows no agenda link when neither exists", async () => {
    const withProp = await container.renderToString(NextMeeting, {
      props: { meeting: sample, settings, agendaUrl: "https://drive.google.com/file/d/zzz/view" },
    });
    expect(withProp).toContain("https://drive.google.com/file/d/zzz/view");
    expect(withProp).not.toContain("docs.google.com/document/d/abc");
    const { agendaUrl: _omit, ...bare } = sample;
    const none = await container.renderToString(NextMeeting, { props: { meeting: bare, settings } });
    expect(none).not.toContain("Agenda");
  });

  it("prints the location for an in-person meeting and no virtual note", async () => {
    const meeting: Meeting = { ...sample, isVirtual: false, location: "Arlington View Community Center" };
    const html = await container.renderToString(NextMeeting, { props: { meeting, settings } });
    expect(html).toContain("Arlington View Community Center");
    expect(html).not.toContain("Virtual meeting");
    expect(html).not.toContain(settings.virtualLinkNote);
  });

  it("never prints the title", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    expect(html).not.toContain("AVCA General Meeting</");
  });
});

describe("MeetingList", () => {
  it("renders nothing for an empty list", async () => {
    const html = await container.renderToString(MeetingList, { props: { meetings: [], rows: [] } });
    expect(html.trim()).toBe("");
  });

  it("lists range, where, and the agenda from the archive rows", async () => {
    const second: Meeting = {
      ...sample,
      uid: "b",
      start: new Date("2026-10-27T23:00:00Z"),
      end: new Date("2026-10-28T00:30:00Z"),
      isVirtual: false,
      location: "Library",
      agendaUrl: undefined,
    };
    const rows = [
      {
        date: "2026-09-29",
        approximate: false,
        meeting: sample,
        agenda: { id: "x", name: "Agenda.pdf", mimeType: "a", modifiedTime: "2026-09-01T00:00:00Z", url: "https://drive.google.com/file/d/x/view", isFolder: false, path: [] },
        minutesDraft: false,
        materials: [],
      },
    ];
    const html = await container.renderToString(MeetingList, { props: { meetings: [sample, second], rows } });
    expect(html).toContain("Tuesday, September 29, 2026, 7:00 to 8:30 pm");
    expect(html).toContain("Virtual meeting");
    expect(html).toContain("Library");
    expect(html).toContain("https://drive.google.com/file/d/x/view");
    expect((html.match(/>Agenda</g) ?? []).length).toBe(1);
  });
});

describe("QuickLinks", () => {
  it("links the four destinations with a slash before any fragment", async () => {
    const html = await container.renderToString(QuickLinks, {});
    expect(hrefs(html)).toEqual(["/documents/#bylaws", "/meetings/#past", "/documents/#presentations", "/resources/"]);
    expect(html).toContain("Minutes and agendas");
    expect(html).toContain("County services");
  });
});

describe("RecentFiles", () => {
  const f: DriveFile = {
    id: "1",
    name: "Minutes 2026-09-29.pdf",
    mimeType: "application/pdf",
    modifiedTime: "2026-10-07T02:30:00Z",
    url: "https://drive.google.com/file/d/1/view",
    isFolder: false,
    path: [],
  };

  it("renders nothing for no files", async () => {
    const html = await container.renderToString(RecentFiles, { props: { files: [] } });
    expect(html.trim()).toBe("");
  });

  it("lists names with New York modified dates", async () => {
    const html = await container.renderToString(RecentFiles, { props: { files: [f] } });
    expect(html).toContain("Recently added");
    expect(html).toContain("Minutes 2026-09-29.pdf");
    expect(html).toContain("October 6, 2026");
    expect(html).toContain('href="https://drive.google.com/file/d/1/view"');
    expect(html).not.toContain("target=");
  });
});
