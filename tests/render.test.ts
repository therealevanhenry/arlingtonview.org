import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it, vi } from "vitest";
import MeetingList from "../src/components/MeetingList.astro";
import NextMeeting from "../src/components/NextMeeting.astro";
import QuickLinks from "../src/components/QuickLinks.astro";
import RecentFiles from "../src/components/RecentFiles.astro";
import type { Meeting } from "../src/lib/calendar";
import { nextMeeting } from "../src/lib/calendar";
import type { DriveFile } from "../src/lib/drive";
import { getSettings, type Settings } from "../src/lib/settings";
import Home from "../src/pages/index.astro";

// The home page reads everything through `loadSiteData`. Swap in a fixed calendar (set per test through
// `home.meetings`) and unreachable Drive folders, so the page renders without the network or the clock.
const home = vi.hoisted(() => ({ meetings: [] as Meeting[] }));

vi.mock("../src/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/data")>();
  const { getSettings: readSettings } = await import("../src/lib/settings");
  const down = { ok: false as const, folderUrl: "https://example.test/f", reason: "test" };
  return {
    ...actual,
    loadSiteData: async (): Promise<import("../src/lib/data").SiteData> => ({
      settings: await readSettings(),
      now: new Date("2026-09-01T12:00:00Z"),
      calendar: { ok: true, meetings: home.meetings },
      folders: { bylaws: down, meetings: down, presentations: down, letters: down, neighborhoodPlan: down },
      rows: [],
    }),
  };
});

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

/** Every class token in the markup, one entry per use. */
const classTokens = (html: string): string[] =>
  [...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter((c) => c !== ""));

/** Text content with tags dropped and whitespace collapsed. */
const textOf = (html: string): string => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

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
    expect(html).toContain("Tuesday");
    expect(html).toContain("September 29");
    expect(html).toContain("7:00 to 8:30 pm");
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

  it("sets the date as a weekday and month-day lockup in one time element, without the year", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    const times = [...html.matchAll(/<time datetime="([^"]*)"[^>]*>([\s\S]*?)<\/time>/g)];
    expect(times).toHaveLength(1);
    const [, datetime, lockup] = times[0];
    expect(datetime).toBe("2026-09-29T23:00:00.000Z");
    // Two lines, separated by whitespace in the source so the text never runs together.
    expect(textOf(lockup)).toBe("Tuesday September 29");
    expect(lockup).not.toContain("2026");
    expect(html).not.toContain("Tuesday, September 29, 2026");
    // The time of day is a detail beside the lockup, not part of it.
    expect(lockup).not.toContain("7:00");
    expect(html.indexOf("</time>")).toBeLessThan(html.indexOf("7:00 to 8:30 pm"));
  });

  it("is the same hero notice, under the cornice, in both states", async () => {
    const withMeeting = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    const fallback = await container.renderToString(NextMeeting, { props: { meeting: undefined, settings } });
    for (const html of [withMeeting, fallback]) {
      expect(html).toMatch(/<section class="notice notice-hero cornice"[^>]*aria-labelledby="next-meeting"/);
      expect(html).toMatch(/<h2[^>]*id="next-meeting"[^>]*>Next meeting<\/h2>/);
      expect((html.match(/<h2/g) ?? []).length).toBe(1);
    }
    expect(classTokens(withMeeting).filter((c) => c === "button")).toHaveLength(1);
    expect(classTokens(fallback)).not.toContain("button");
  });

  it("sets the standing rule as the fallback lead, ahead of the note and the subscribe links", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: undefined, settings } });
    expect(html).toMatch(/<p class="notice-rule">/);
    const rule = html.indexOf(settings.meetingRule);
    const note = html.indexOf(settings.virtualLinkNote);
    const subscribe = html.indexOf("Subscribe to calendar");
    expect(rule).toBeGreaterThan(-1);
    expect(rule).toBeLessThan(note);
    expect(note).toBeLessThan(subscribe);
    expect(html).toContain("Calendar file (ICS)");
    expect(html).not.toContain("Add to Google Calendar");
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

  it("links the contact email after the note in both states", async () => {
    const mailto = `<a href="mailto:${settings.contactEmail}">${settings.contactEmail}</a>`;
    const withMeeting = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    const fallback = await container.renderToString(NextMeeting, { props: { meeting: undefined, settings } });
    for (const html of [withMeeting, fallback]) {
      expect(html).toContain(mailto);
      expect(html.indexOf(settings.virtualLinkNote)).toBeLessThan(html.indexOf(mailto));
    }
  });

  it("puts the button and subscribe links in one actions row", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    expect(html).toMatch(/<(?:p|div) class="actions">[\s\S]*Add to Google Calendar[\s\S]*Subscribe to calendar[\s\S]*Calendar file \(ICS\)/);
  });

  it("never prints the title", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    expect(html).not.toContain("AVCA General Meeting</");
  });
});

describe("home page", () => {
  // The mocked `now` is September 1, 2026, so the sample (September 29) is the next meeting.
  const render = (meetings: Meeting[]): Promise<string> => {
    home.meetings = meetings;
    return container.renderToString(Home, { request: new Request("https://arlingtonview.org/") });
  };
  const main = (html: string): string => html.slice(html.indexOf("<main"), html.indexOf("</main>"));

  it("has exactly one button, the add-to-calendar action", async () => {
    const html = await render([sample]);
    expect(html).toContain("September 29");
    expect(classTokens(html).filter((c) => c === "button")).toHaveLength(1);
    expect(html).toMatch(/<a class="button" href="[^"]*calendar\/render\?action=TEMPLATE[^"]*">\s*Add to Google Calendar\s*<\/a>/);
  });

  it("links How to join as a plain link under the lead paragraph", async () => {
    const html = main(await render([sample]));
    expect(html).toMatch(/<p class="lead">\s*The Arlington View Civic Association/);
    expect(html).toMatch(/<a href="\/join\/">How to join<\/a>/);
    expect(html.indexOf('class="lead"')).toBeLessThan(html.indexOf("How to join"));
    expect(html.indexOf("</section>")).toBeLessThan(html.indexOf('class="lead"'));
  });

  it("has no button at all when there is no upcoming meeting", async () => {
    const html = await render([]);
    expect(html).toContain(settings.meetingRule);
    expect(classTokens(html)).not.toContain("button");
    expect(html).toContain("How to join");
  });

  it("keeps one h1, no script, and nothing opening in a new tab", async () => {
    const html = await render([sample]);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("target=");
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
    expect(html).toContain('<time datetime="2026-09-29T23:00:00.000Z">Tuesday, September 29, 2026, 7:00 to 8:30 pm</time>');
    expect(html).toContain('<time datetime="2026-10-27T23:00:00.000Z">');
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
    expect(html).toMatch(/<h2 class="visually-hidden">Quick links<\/h2>/);
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
