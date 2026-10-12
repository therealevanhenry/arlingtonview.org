import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it, vi } from "vitest";
import BoardTable from "../src/components/BoardTable.astro";
import HistoryFolderLink from "../src/components/HistoryFolderLink.astro";
import HistoryPhotos from "../src/components/HistoryPhotos.astro";
import JoinAction from "../src/components/JoinAction.astro";
import LinkGroups from "../src/components/LinkGroups.astro";
import ArchiveTable from "../src/components/ArchiveTable.astro";
import FileList from "../src/components/FileList.astro";
import FolderFallback from "../src/components/FolderFallback.astro";
import MeetingList from "../src/components/MeetingList.astro";
import NextMeeting from "../src/components/NextMeeting.astro";
import QuickLinks from "../src/components/QuickLinks.astro";
import RecentFiles from "../src/components/RecentFiles.astro";
import type { Meeting } from "../src/lib/calendar";
import { nextMeeting } from "../src/lib/calendar";
import type { DriveFile } from "../src/lib/drive";
import { withBase } from "../src/lib/paths";
import { getBoard, getResources, type Board, type Settings } from "../src/lib/settings";
import History from "../src/pages/about/history.astro";
import Documents from "../src/pages/documents.astro";
import { formatTermMonth } from "../src/lib/time";
import { photosFromModules } from "../src/lib/historyPhotos";
import img1934 from "../src/assets/history/AVCA_1934.png";
import img1956 from "../src/assets/history/AVCA_1956.png";
import Home from "../src/pages/index.astro";
import Meetings from "../src/pages/meetings.astro";
import type { ArchiveRow } from "../src/lib/archive";
import { parseMeetingDate } from "../src/lib/meetingDate";
import type { FolderResult } from "../src/lib/drive";

// The home page reads everything through `loadSiteData`. Swap in a fixed calendar (set per test through
// `home.meetings`) and unreachable Drive folders, so the page renders without the network or the clock.
const home = vi.hoisted(() => ({
  // Settings are defined here, not read from src/content/settings.yaml: these tests check how pages use
  // settings, and an owner editing that file must never fail them.
  settings: {
    siteName: "Fixture Association",
    shortName: "FA",
    siteUrl: "https://fixture.example.org",
    contactEmail: "board@fixture.example.org",
    calendarId: "fixture-calendar@group.calendar.google.com",
    meetingRule: "Meetings are held on a fixture schedule, unless otherwise noted.",
    virtualLinkNote: "The virtual meeting link is sent by email. Write to us if you need it.",
    joinFormUrl: "",
    drive: {
      bylaws: "fixture-bylaws",
      bylawsCurrentFileId: "FIXTURECURRENTFILEID",
      meetings: "fixture-meetings",
      presentations: "fixture-presentations",
      letters: "fixture-letters",
      neighborhoodPlan: "fixture-plan",
      history: "fixture-history",
    },
  } as import("../src/lib/settings").Settings,
  meetings: [] as Meeting[],
  calendarOk: true,
  folders: undefined as Record<string, FolderResult> | undefined,
  buildRows: false,
}));

vi.mock("../src/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/data")>();
  const { buildArchive: build, currentBylaws } = await import("../src/lib/archive");
  const down = { ok: false as const, folderUrl: "https://example.test/f", reason: "test" };
  return {
    ...actual,
    loadSiteData: async (): Promise<import("../src/lib/data").SiteData> => {
      const folders = (home.folders ?? {
        bylaws: down,
        meetings: down,
        presentations: down,
        letters: down,
        neighborhoodPlan: down,
      }) as import("../src/lib/data").SiteData["folders"];
      return {
        settings: home.settings,
        now: new Date("2026-09-01T12:00:00Z"),
        calendar: home.calendarOk ? { ok: true, meetings: home.meetings } : { ok: false, reason: "test" },
        folders,
        rows: home.buildRows ? build(home.meetings, folders) : [],
        currentBylaws: currentBylaws(home.settings.drive.bylawsCurrentFileId, folders.bylaws),
      };
    },
  };
});

// The content layer's data store is empty under Vitest (see src/lib/settings.ts), so the pages that render a
// Markdown entry get a stand-in entry whose body is a lead paragraph and a second paragraph.
vi.mock("astro:content", () => ({
  getEntry: async (collection: string, id: string) => ({ collection, id, data: { title: id } }),
  render: async () => ({ Content: (await import("./fixtures/ProseStub.astro")).default }),
}));

let container: AstroContainer;
let settings: Settings;

const sample: Meeting = {
  uid: "a",
  start: new Date("2026-09-29T23:00:00Z"),
  end: new Date("2026-09-30T00:30:00Z"),
  title: "AVCA General Meeting",
  isVirtual: true,
};
/** The Drive agenda for the sample meeting, as `agendaFor` would hand it to the notice. */
const AGENDA = "https://drive.google.com/file/d/sampleagenda/view";

beforeAll(async () => {
  container = await AstroContainer.create();
  settings = home.settings;
});

const hrefs = (html: string): string[] => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** Every class token in the markup, one entry per use. */
const classTokens = (html: string): string[] =>
  [...html.matchAll(/\sclass="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter((c) => c !== ""));

const countOf = (html: string, needle: string): number => html.split(needle).length - 1;

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
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings, agendaUrl: AGENDA } });
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

  it("splits the notice by meaning: when and where, then how to attend", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings, agendaUrl: AGENDA } });
    const when = html.indexOf('class="notice-when"');
    const details = html.indexOf('class="notice-details');
    expect(when).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(when);
    const left = html.slice(when, details);
    const right = html.slice(details);
    // When and where: the lockup, then the time of day and the place.
    expect(left).toContain("</time>");
    expect(left).toMatch(/<p class="notice-time">7:00 to 8:30 pm<\/p>\s*<p class="notice-place">Virtual meeting<\/p>/);
    expect(left).not.toContain(settings.virtualLinkNote);
    expect(left).not.toContain("Agenda");
    expect(left).not.toContain('class="actions"');
    expect(left).not.toContain("href=");
    // How to attend: the note with the contact link, the agenda, the actions.
    expect(right).toContain(settings.virtualLinkNote);
    expect(right).toContain(`mailto:${settings.contactEmail}`);
    expect(right).toContain(">Agenda</a>");
    expect(right).toContain('class="actions"');
    expect(right).not.toContain("7:00 to 8:30 pm");
    expect(right).not.toContain("Virtual meeting");
    expect(right).not.toContain("<time");
    // One reading order, which is also the one-column order on phones.
    const order = ["</time>", "7:00 to 8:30 pm", "Virtual meeting", settings.virtualLinkNote, ">Agenda</a>", 'class="actions"'].map(
      (needle) => html.indexOf(needle),
    );
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("leaves only the actions row on the right for an in-person meeting with no agenda", async () => {
    const meeting: Meeting = { ...sample, isVirtual: false, location: "Arlington View Community Center" };
    const html = await container.renderToString(NextMeeting, { props: { meeting, settings } });
    const details = html.indexOf('class="notice-details');
    const left = html.slice(html.indexOf('class="notice-when"'), details);
    const right = html.slice(details);
    expect(left).toMatch(/<p class="notice-time">7:00 to 8:30 pm<\/p>\s*<p class="notice-place">Arlington View Community Center<\/p>/);
    expect(right).toMatch(/^class="notice-details[^"]*">\s*<div class="actions">/);
    expect(right).not.toContain("notice-meta");
    expect(right).not.toContain("mailto:");
    expect(right).toContain("Add to Google Calendar");
  });

  it("keeps the fallback in the same two zones: the rule, then the note and subscribe links", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: undefined, settings } });
    const details = html.indexOf('class="notice-details');
    const left = html.slice(0, details);
    const right = html.slice(details);
    expect(left).toContain(settings.meetingRule);
    expect(left).not.toContain("notice-when");
    expect(left).not.toContain("notice-time");
    expect(left).not.toContain("href=");
    expect(right).toContain(settings.virtualLinkNote);
    expect(right).toContain(`mailto:${settings.contactEmail}`);
    expect(right).toContain("Subscribe to calendar");
    expect(right).not.toContain(settings.meetingRule);
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

  it("links the agenda only from the agendaUrl prop (the Drive agenda); a meeting carries no link of its own", async () => {
    const withProp = await container.renderToString(NextMeeting, {
      props: { meeting: sample, settings, agendaUrl: "https://drive.google.com/file/d/zzz/view" },
    });
    expect(withProp).toContain('<a href="https://drive.google.com/file/d/zzz/view">Agenda</a>');
    const none = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
    expect(none).not.toContain("Agenda");
    // A stray link on the meeting object (the removed calendar-description fallback) is ignored.
    const stray = { ...sample, agendaUrl: "https://docs.google.com/document/d/unvetted/edit" } as Meeting;
    const ignored = await container.renderToString(NextMeeting, { props: { meeting: stray, settings } });
    expect(ignored).not.toContain("Agenda");
    expect(ignored).not.toContain("unvetted");
  });

  it("sets the agenda link in its own paragraph, after the note, with the class that spaces it from the contact link", async () => {
    const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings, agendaUrl: AGENDA } });
    expect(html).toMatch(new RegExp(`<p class="notice-note">[\\s\\S]*?</p>\\s*<p class="notice-agenda">\\s*<a href="${AGENDA}">Agenda</a>\\s*</p>`));
    expect(classTokens(html).filter((c) => c === "notice-agenda")).toHaveLength(1);
  });

  it("shows the venue AND the virtual-link note for a hybrid meeting", async () => {
    const meeting: Meeting = { ...sample, isVirtual: true, location: "Carver Community Center (also on Zoom)" };
    const html = await container.renderToString(NextMeeting, { props: { meeting, settings } });
    const details = html.indexOf('class="notice-details');
    expect(html.slice(0, details)).toContain("Carver Community Center (also on Zoom)");
    expect(html).not.toContain("Virtual meeting");
    expect(html.slice(details)).toContain(settings.virtualLinkNote);
    expect(html.slice(details)).toContain(`mailto:${settings.contactEmail}`);
  });

  it("prints Virtual meeting for a location that is only a virtual term", async () => {
    for (const location of ["Virtual", "Google Meet", "Zoom meeting", "online"]) {
      const html = await container.renderToString(NextMeeting, { props: { meeting: { ...sample, isVirtual: true, location }, settings } });
      expect(spaced(html), location).toContain("7:00 to 8:30 pm Virtual meeting");
      expect(html, location).toContain(settings.virtualLinkNote);
    }
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
    expect(html).not.toContain("AVCA General Meeting");
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
    expect(html).toContain(`<a href="${withBase("/join/")}">How to join</a>`);
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

  const agendaRow = {
    date: "2026-09-29",
    approximate: false,
    meeting: sample,
    agenda: { id: "x", name: "Agenda.pdf", mimeType: "a", modifiedTime: "2026-09-01T00:00:00Z", url: "https://drive.google.com/file/d/x/view", isFolder: false, path: [] },
    minutesDraft: false,
    materials: [],
  };
  const second: Meeting = {
    ...sample,
    uid: "b",
    start: new Date("2026-10-27T23:00:00Z"),
    end: new Date("2026-10-28T00:30:00Z"),
    isVirtual: false,
    location: "Library",
  };
  const third: Meeting = {
    ...sample,
    uid: "c",
    start: new Date("2027-01-19T00:00:00Z"),
    end: new Date("2027-01-19T01:30:00Z"),
  };

  it("sets each meeting as a schedule item: date, then time, place, and the agenda link", async () => {
    const html = await container.renderToString(MeetingList, { props: { meetings: [sample, second], rows: [agendaRow] } });
    expect(html).toContain('<ol class="schedule"');
    expect(classTokens(html).filter((c) => c === "schedule-item")).toHaveLength(2);
    expect(html).toContain('<time datetime="2026-09-29T23:00:00.000Z"');
    expect(html).toContain('<time datetime="2026-10-27T23:00:00.000Z"');
    expect(html).toContain("7:00 to 8:30 pm");
    expect(html).toContain("Virtual meeting");
    expect(html).toContain("Library");
    expect(html).toContain('<a href="https://drive.google.com/file/d/x/view">Agenda<span class="visually-hidden">, Tuesday, September 29</span></a>');
    expect((html.match(/>Agenda</g) ?? []).length).toBe(1);
  });

  it("prints the date as weekday and month-day with no year, and no separators in the details", async () => {
    const html = await container.renderToString(MeetingList, { props: { meetings: [sample], rows: [] } });
    const time = html.match(/<time[^>]*>([\s\S]*?)<\/time>/);
    expect(time).not.toBeNull();
    expect(textOf(time![1])).toBe("Tuesday, September 29");
    const details = html.slice(html.indexOf("schedule-details"));
    expect(textOf(details)).not.toMatch(/[,|\u00b7]/);
  });

  it("groups by New York year, in order, one h3 per year", async () => {
    const html = await container.renderToString(MeetingList, { props: { meetings: [sample, second, third], rows: [] } });
    const years = [...html.matchAll(/<h3[^>]*>(\d{4})<\/h3>/g)].map((m) => m[1]);
    // 2027-01-19T00:00Z is still January 18 in New York: 2027 either way, but the group must exist once.
    expect(years).toEqual(["2026", "2027"]);
    expect(html.indexOf(">2026<")).toBeLessThan(html.indexOf("September 29"));
    expect(html.indexOf("October 27")).toBeLessThan(html.indexOf(">2027<"));
    expect(countOf(html, "<ol")).toBe(2);
  });

  it("puts a meeting late on December 31 in New York in that year's group", async () => {
    const nye: Meeting = { ...sample, uid: "d", start: new Date("2027-01-01T02:00:00Z"), end: new Date("2027-01-01T03:30:00Z") };
    const html = await container.renderToString(MeetingList, { props: { meetings: [nye], rows: [] } });
    expect(html).toMatch(/<h3[^>]*>2026<\/h3>/);
    expect(textOf(html)).toContain("Thursday, December 31");
  });

  it("shows an agenda link only when one is available", async () => {
    const html = await container.renderToString(MeetingList, { props: { meetings: [second], rows: [] } });
    expect(html).not.toContain("Agenda");
  });

  it("prints the place label: the location as written, or Virtual meeting when it names no place", async () => {
    const hybrid: Meeting = { ...sample, uid: "h", isVirtual: true, location: "Carver Community Center (also on Zoom)" };
    const meetOnly: Meeting = { ...second, uid: "g", isVirtual: true, location: "Google Meet" };
    const html = await container.renderToString(MeetingList, { props: { meetings: [hybrid, meetOnly], rows: [] } });
    expect(html).toContain("Carver Community Center (also on Zoom)");
    expect(html).not.toContain("Google Meet");
    expect(countOf(html, "Virtual meeting")).toBe(1);
  });
});

describe("RecentFiles with a bad timestamp", () => {
  it("lists the name and omits the date", async () => {
    const f: DriveFile = { id: "1", name: "Odd.pdf", mimeType: "a", modifiedTime: "garbage", url: "https://d/1", isFolder: false, path: [] };
    const html = await container.renderToString(RecentFiles, { props: { files: [f] } });
    expect(html).toContain("Odd.pdf");
    expect(html).not.toContain("<time");
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
    expect(html).toMatch(/<h2[^>]*>Recently updated<\/h2>/);
    expect(html).not.toContain("Recently added");
    expect(html).toContain("Minutes 2026-09-29.pdf");
    expect(html).toContain("October 6, 2026");
    expect(html).toContain('href="https://drive.google.com/file/d/1/view"');
    expect(html).not.toContain("target=");
  });
});

// ---------------------------------------------------------------------------------------------------
// Meetings and Documents. Fixture files are shaped like the owner's real Drive folders.

const FOLDER_URL = (id: string): string => `https://drive.google.com/drive/folders/${id}`;
const DOC = "application/vnd.google-apps.document";
const PDF = "application/pdf";
let fileCounter = 0;
function driveFile(name: string, path: string[] = [], extra: Partial<DriveFile> = {}): DriveFile {
  const id = `f${String(++fileCounter).padStart(3, "0")}`;
  const parsed = parseMeetingDate(name);
  return {
    id,
    name,
    mimeType: DOC,
    modifiedTime: "2026-08-15T12:00:00.000Z",
    url: `https://drive.google.com/file/d/${id}/view`,
    isFolder: false,
    path,
    ...(parsed ? { meetingDate: parsed.date, approximate: parsed.approximate } : {}),
    ...extra,
  };
}
const okResult = (id: string, files: DriveFile[]): FolderResult => ({ ok: true, files, folderUrl: FOLDER_URL(id) });
const downResult = (id: string): FolderResult => ({ ok: false, folderUrl: FOLDER_URL(id), reason: "HTTP 403" });
const folderEntry = (name: string, path: string[] = []): DriveFile =>
  driveFile(name, path, { isFolder: true, mimeType: "application/vnd.google-apps.folder" });

/** The folder link as rendered: the visible text, then the section name for screen readers only. */
const folderLink = (url: string, section: string): string =>
  `<a href="${url}">Open folder in Google Drive<span class="visually-hidden">, ${section}</span></a>`;

describe("FolderFallback", () => {
  it("says the list is unavailable and links the folder, naming the section for screen readers", async () => {
    const html = await container.renderToString(FolderFallback, { props: { folderUrl: FOLDER_URL("X"), section: "Official letters" } });
    expect(textOf(html)).toContain("The file list is not available right now.");
    expect(html).toContain(folderLink(FOLDER_URL("X"), "Official letters"));
  });
});

describe("FileList", () => {
  it("renders fallback with folder link on ok:false", async () => {
    const result: FolderResult = { ok: false, folderUrl: "https://drive.google.com/drive/folders/X", reason: "403" };
    const html = await container.renderToString(FileList, { props: { result, title: "Minutes", id: "minutes" } });
    expect(html).toContain(folderLink("https://drive.google.com/drive/folders/X", "Minutes"));
    expect(countOf(html, "folders/X")).toBe(1);
    expect(html).toContain('<section id="minutes"');
    expect(html).toMatch(/<h2[^>]*>Minutes<\/h2>/);
  });

  it("keeps the slot, then the fallback, when ok:false", async () => {
    const result = downResult("B");
    const html = await container.renderToString(FileList, {
      props: { result, title: "Bylaws", id: "bylaws" },
      slots: { default: '<p id="slotted">Current bylaws</p>' },
    });
    expect(html.indexOf("Bylaws</h2>")).toBeLessThan(html.indexOf("slotted"));
    expect(html.indexOf("slotted")).toBeLessThan(html.indexOf("not available"));
    expect(countOf(html, "Open folder in Google Drive")).toBe(1);
  });

  it("lists file names as links, hides folders and (OLD) files, and ends with the folder link once", async () => {
    const result = okResult("M", [
      folderEntry("2026-2027"),
      driveFile("AVCA Monthly Meeting Proposed Agenda - October 20, 2026", ["2026-2027", "26 10 October"]),
      driveFile("(OLD) AVCA 2025 Feb mtg mins", ["2024-2025"]),
      driveFile("Motion of Neutrality on S Pierce Street", ["2024-2025"]),
    ]);
    const html = await container.renderToString(FileList, { props: { result, title: "Minutes and agendas", id: "minutes", group: "path" } });
    expect(html).toContain("AVCA Monthly Meeting Proposed Agenda - October 20, 2026</a>");
    expect(html).toContain("Motion of Neutrality on S Pierce Street</a>");
    expect(html).not.toContain("(OLD)");
    expect(html).not.toMatch(/>2026-2027<\/a>/);
    expect(countOf(html, "Open folder in Google Drive")).toBe(1);
    expect(html).toContain(folderLink(FOLDER_URL("M"), "Minutes and agendas"));
    expect(html.lastIndexOf("Open folder in Google Drive")).toBeGreaterThan(html.lastIndexOf("</ul>"));
  });

  it("orders path groups newest first, with sub-headings one level under the title", async () => {
    const result = okResult("M", [
      driveFile("AVCA 2025 Jun mtg mins", ["2025-2026"]),
      driveFile("AVCA 2026 Sep mtg mins (draft)", ["2026-2027"]),
    ]);
    const html = await container.renderToString(FileList, { props: { result, title: "Minutes and agendas", id: "minutes", group: "path" } });
    expect(html).toMatch(/<h3[^>]*>2026-2027<\/h3>/);
    expect(html.indexOf("2026-2027")).toBeLessThan(html.indexOf("2025-2026"));
  });

  it("puts top-level files first under no sub-heading in a path group", async () => {
    const result = okResult("B", [
      driveFile("Old thing", ["Old Bylaws"]),
      driveFile("Top level.pdf", [], { mimeType: PDF }),
    ]);
    const html = await container.renderToString(FileList, { props: { result, title: "Bylaws", id: "bylaws", group: "path" } });
    expect(html.indexOf("Top level.pdf")).toBeLessThan(html.indexOf("Old Bylaws"));
    expect(html.indexOf("Top level.pdf")).toBeLessThan(html.indexOf("<h3"));
  });

  it("groups by year with the year as sub-heading, Undated last", async () => {
    const result = okResult("P", [
      driveFile("Deck 2025-03-04", [], {}),
      driveFile("Untitled deck"),
      driveFile("Deck 2026-06-24"),
    ]);
    const html = await container.renderToString(FileList, { props: { result, title: "Presentations", id: "presentations", group: "year" } });
    const order = ["2026", "2025", "Undated"].map((y) => html.search(new RegExp(`<h3[^>]*>${y}</h3>`)));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("supports a level 3 title", async () => {
    const html = await container.renderToString(FileList, { props: { result: okResult("P", []), title: "T", id: "t", level: 3 } });
    expect(html).toMatch(/<h3[^>]*>T<\/h3>/);
    expect(html).not.toContain("<h2");
  });

  it("shows the parsed meeting date, month only when approximate, else the modified date", async () => {
    const result = okResult("N", [
      driveFile("AVCA Proposed Agenda 06.24.2026"),
      driveFile("AVCA 2025 Jun mtg mins"),
      driveFile("Plan summary"),
    ]);
    const html = await container.renderToString(FileList, { props: { result, title: "Plan", id: "plan" } });
    expect(html).toContain("June 24, 2026");
    expect(html).toContain("June 2025");
    expect(html).not.toContain("June 1, 2025");
    expect(html).toContain('datetime="2025-06"');
    expect(html).not.toContain('datetime="2025-06-01"');
    expect(html).toContain('datetime="2026-06-24"');
    expect(html).toContain("August 15, 2026");
    // Only the undated file's fallback is labeled; the word sits outside the <time>.
    expect(countOf(html, "Updated")).toBe(1);
    expect(html).toMatch(/Updated\s*<time class="file-date"[^>]*>August 15, 2026<\/time>|class="file-date">Updated\s*<time[^>]*>August 15, 2026<\/time>/);
    expect(html).not.toMatch(/Updated\s*(<time[^>]*>)?June/);
  });

  it("omits the date, and does not throw, for an unparseable modified time", async () => {
    const bad = driveFile("Plan summary", [], { modifiedTime: "garbage" });
    const html = await container.renderToString(FileList, { props: { result: okResult("N", [bad]), title: "Plan", id: "plan" } });
    expect(html).toContain("Plan summary</a>");
    expect(html).not.toContain("<time");
  });

  it("shows Nothing posted yet. and the folder link for an empty ok result", async () => {
    const html = await container.renderToString(FileList, { props: { result: okResult("E", [folderEntry("Sub")]), title: "Letters", id: "letters" } });
    expect(html).toContain("Nothing posted yet.");
    expect(countOf(html, "Open folder in Google Drive")).toBe(1);
    expect(html).toContain(FOLDER_URL("E"));
    expect(html).not.toContain(">Sub<");
  });
});

describe("ArchiveTable", () => {
  const base: ArchiveRow = { date: "2026-06-24", approximate: false, minutesDraft: false, materials: [] };
  const agenda = driveFile("AVCA Proposed Agenda 06.24.2026");
  const minutes = driveFile("AVCA 2026 June mtg mins");
  const render = (rows: ArchiveRow[], filesLoaded = true) => container.renderToString(ArchiveTable, { props: { rows, filesLoaded } });

  it("renders nothing for no rows", async () => {
    expect((await render([])).trim()).toBe("");
  });

  it("has the four columns, long dates, and links for agenda and minutes", async () => {
    const html = await render([{ ...base, agenda, minutes }]);
    for (const col of ["Date", "Agenda", "Minutes", "Materials"]) expect(html).toMatch(new RegExp(`<th[^>]*>${col}</th>`));
    expect(html).toContain("June 24, 2026");
    expect(html).toContain(`<a href="${agenda.url}">Agenda<span class="visually-hidden">, June 24, 2026</span></a>`);
    expect(html).toContain(`<a href="${minutes.url}">Minutes<span class="visually-hidden">, June 24, 2026</span></a>`);
    expect(html).not.toContain("(draft)");
    expect(html).not.toContain("Not posted");
  });

  it("marks draft minutes, outside the link, after the hidden date", async () => {
    const html = await render([{ ...base, minutes, minutesDraft: true }]);
    expect(html).toMatch(new RegExp(`<a href="${minutes.url}">Minutes<span class="visually-hidden">, June 24, 2026</span></a>\\s*\\(draft\\)`));
    // What is drawn (the hidden span removed) still reads "Minutes (draft)".
    expect(textOf(html.replace(/<span class="visually-hidden">[^<]*<\/span>/g, ""))).toContain("Minutes (draft)");
  });

  it("gives every repeated link in the table a different accessible name: the row's date", async () => {
    const rows: ArchiveRow[] = [
      { ...base, agenda, minutes },
      { ...base, date: "2026-05-27", agenda: driveFile("AVCA Proposed Agenda 05.27.2026"), minutes: driveFile("AVCA 2026 May mtg mins"), minutesDraft: true },
      { ...base, date: "2023-04-01", approximate: true, minutes: driveFile("AVCA 2023 Apr mtg mins") },
    ];
    const html = await render(rows);
    const names = [...html.matchAll(/<a href="[^"]*">((?:Agenda|Minutes)<span class="visually-hidden">[^<]*<\/span>)<\/a>/g)].map((m) => textOf(m[1]));
    expect(names).toEqual(["Agenda, June 24, 2026", "Minutes, June 24, 2026", "Agenda, May 27, 2026", "Minutes, May 27, 2026", "Minutes, April 2023"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("makes the date cell the row header, still labelled for the stacked layout", async () => {
    const html = await render([{ ...base, agenda }, { ...base, date: "2026-05-26" }]);
    const headers = [...html.matchAll(/<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/g)];
    expect(headers.map((m) => textOf(m[1]))).toEqual(["June 24, 2026", "May 26, 2026"]);
    for (const [tag] of headers) {
      expect(tag).toContain('role="rowheader"');
      expect(tag).toContain('data-label="Date"');
      expect(tag).toContain("<time datetime=");
    }
    // The first cell of every body row, and only that cell.
    const bodyRows = [...html.slice(html.indexOf("<tbody")).matchAll(/<tr\b[^>]*>\s*<(th|td)\b/g)].map((m) => m[1]);
    expect(bodyRows).toEqual(["th", "th"]);
  });

  it("says Not posted when agenda or minutes are missing and the folder was read", async () => {
    const html = await render([base]);
    expect(countOf(html, "Not posted")).toBe(2);
    expect(html).not.toContain("Not available");
  });

  it("says Not available, not Not posted, when the Drive folder was not loaded: missing is unknown, not a fact", async () => {
    const deck = driveFile("Zoning deck 2026-06-24");
    const html = await render([base, { ...base, date: "2026-05-26", materials: [deck] }], false);
    expect(countOf(html, "Not available")).toBe(4);
    expect(html).not.toContain("Not posted");
    expect(html).toMatch(/<span class="soft">Not available<\/span>/);
    // Materials from the Presentations folder can still be there.
    expect(html).toContain("Zoning deck 2026-06-24</a>");
  });

  it("shows month and year with a (month) marker for approximate dates", async () => {
    const html = await render([{ ...base, date: "2023-04-01", approximate: true }]);
    expect(textOf(html)).toContain("April 2023 (month)");
    expect(html).toContain('<time datetime="2023-04">');
    expect(html).not.toContain("April 1, 2023");
  });

  it("does not mark exact dates", async () => {
    expect(await render([base])).not.toContain("(month)");
  });

  it("lists materials as links and leaves an empty cell otherwise", async () => {
    const m = driveFile("Motion of Neutrality on S Pierce Street");
    const html = await render([{ ...base, materials: [m] }, { ...base, date: "2026-05-26" }]);
    expect(html).toContain(`<a href="${m.url}">Motion of Neutrality on S Pierce Street</a>`);
    expect(countOf(html, "cell-empty")).toBe(1);
  });

  it("labels every td and carries table roles", async () => {
    const html = await render([{ ...base, agenda }, { ...base, date: "2026-05-26" }]);
    const tds = [...html.matchAll(/<td\b[^>]*>/g)].map((m) => m[0]);
    expect(tds).toHaveLength(6); // Agenda, Minutes, Materials per row; the date is the row header
    for (const td of tds) {
      expect(td).toContain("data-label=");
      expect(td).toContain('role="cell"');
    }
    expect(html).toContain('role="table"');
    expect(html).toContain('role="rowgroup"');
    expect(html).toContain('role="row"');
    expect(html).toContain('role="columnheader"');
    expect(countOf(html, 'role="rowheader"')).toBe(2);
  });
});

describe("meetings page", () => {
  const upcomingOne: Meeting = { ...sample, start: new Date("2026-09-29T23:00:00Z"), end: new Date("2026-09-30T00:30:00Z") };
  const render = (meetings: Meeting[], opts: { folders?: Record<string, FolderResult>; calendarOk?: boolean } = {}): Promise<string> => {
    home.meetings = meetings;
    home.calendarOk = opts.calendarOk ?? true;
    home.folders = opts.folders;
    home.buildRows = opts.folders !== undefined;
    return container.renderToString(Meetings, { request: new Request("https://arlingtonview.org/meetings/") });
  };
  const main = (html: string): string => html.slice(html.indexOf("<main"), html.indexOf("</main>"));

  it("renders the rule, the note, upcoming meetings, subscribe links, and the past section with every folder down", async () => {
    const html = main(await render([upcomingOne]));
    expect(html).toContain(settings.meetingRule);
    expect(html).toContain(settings.virtualLinkNote);
    expect(html).toContain(`href="mailto:${settings.contactEmail}"`);
    expect(html).toMatch(/<h2[^>]*>Upcoming meetings<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>2026<\/h3>/);
    expect(textOf(html)).toContain("Tuesday, September 29");
    expect(html).toContain("Subscribe to calendar");
    expect(html).toContain("Calendar file (ICS)");
    expect(html).toMatch(/<h2 id="past"[^>]*>Past meetings<\/h2>/);
    expect(html).toContain("The file list is not available right now.");
    expect(html).toContain(folderLink("https://example.test/f", "Minutes and agendas"));
    expect(html).not.toContain("meet.google.com");
    expect(html).not.toContain("<table");
  });

  it("keeps one h1, no script, no new-tab links", async () => {
    const html = await render([upcomingOne]);
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("<title>Meetings | ");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("target=");
  });

  it("says dates are unavailable, with subscribe links, when the calendar is down", async () => {
    const html = main(await render([], { calendarOk: false }));
    expect(textOf(html)).toContain("Upcoming meeting dates are not available right now");
    expect(html).toContain("Subscribe to calendar");
    expect(html).not.toContain("<time");
  });

  it("says the same when the calendar is fine but has nothing ahead", async () => {
    const html = main(await render([]));
    expect(textOf(html)).toContain("Upcoming meeting dates are not available right now");
    expect(html).toContain("Calendar file (ICS)");
  });

  it("builds the past table from the archive and links the meetings folder once it loads", async () => {
    const past: Meeting = { ...sample, uid: "past", start: new Date("2026-06-24T23:00:00Z"), end: new Date("2026-06-25T00:30:00Z") };
    const folders = {
      bylaws: downResult("b"),
      meetings: okResult("19POeuA29OJnWSE4oLLrT3bXyaVsmB298", [
        driveFile("AVCA Proposed Agenda 06.24.2026", ["2026-2027", "26 06 June"]),
        driveFile("(OLD) AVCA 2025 Feb mtg mins", ["2024-2025", "25 02 February"]),
      ]),
      presentations: okResult("p", []),
      letters: downResult("l"),
      neighborhoodPlan: downResult("n"),
    };
    const html = main(await render([past, upcomingOne], { folders }));
    expect(html).toContain('role="table"');
    expect(html).toContain("June 24, 2026");
    expect(html).toMatch(/>Agenda<span class="visually-hidden">, June 24, 2026<\/span><\/a>/);
    expect(html).not.toContain("(OLD)");
    const rowDates = [...html.matchAll(/data-label="Date"[^>]*>([\s\S]*?)<\/th>/g)].map((m) => textOf(m[1]));
    expect(rowDates).toEqual(["June 24, 2026"]);
    expect(html).toContain(folderLink(FOLDER_URL("19POeuA29OJnWSE4oLLrT3bXyaVsmB298"), "Minutes and agendas"));
    expect(html).not.toContain("The file list is not available");
    // The folder was read, so a missing file is a fact.
    expect(countOf(html, "Not posted")).toBe(1);
    expect(html).not.toContain("Not available");
  });

  it("keeps the past table and swaps in a specific sentence when the meetings folder is down", async () => {
    const past: Meeting = { ...sample, uid: "past3", start: new Date("2026-06-24T23:00:00Z"), end: new Date("2026-06-25T00:30:00Z") };
    const folders = { bylaws: downResult("b"), meetings: downResult("m"), presentations: okResult("p", []), letters: downResult("l"), neighborhoodPlan: downResult("n") };
    const html = main(await render([past], { folders }));
    expect(html).toContain('role="table"');
    expect(textOf(html)).toContain("Agendas and minutes could not be loaded right now.");
    expect(html).not.toContain("The file list is not available");
    expect(countOf(html, "Open folder in Google Drive")).toBe(1);
    expect(countOf(html, FOLDER_URL("m"))).toBe(1);
    // The folder was not read: the table must not claim the agenda and minutes were never posted.
    expect(countOf(html, "Not available")).toBe(2);
    expect(html).not.toContain("Not posted");
  });

  it("sets the rule as the lead and the virtual note as body text in a measure", async () => {
    const html = main(await render([upcomingOne]));
    expect(html).toMatch(new RegExp(`<p class="lead">\\s*${settings.meetingRule.replace(/[.]/g, "\\.")}\\s*</p>`));
    expect(html).toMatch(new RegExp(`<p class="measure">\\s*${settings.virtualLinkNote.replace(/[.]/g, "\\.")}`));
    expect(html.indexOf('class="lead"')).toBeLessThan(html.indexOf(settings.virtualLinkNote));
  });

  it("constrains the past table with the archive modifier", async () => {
    const past: Meeting = { ...sample, uid: "past4", start: new Date("2026-06-24T23:00:00Z"), end: new Date("2026-06-25T00:30:00Z") };
    const folders = { bylaws: downResult("b"), meetings: okResult("m", []), presentations: okResult("p", []), letters: downResult("l"), neighborhoodPlan: downResult("n") };
    const html = await render([past], { folders });
    expect(classTokens(html)).toContain("table-archive");
  });

  it("prints nothing from a past meeting beyond date, time, place, and the agenda link", async () => {
    const past: Meeting = { ...sample, uid: "past2", title: "SECRET TITLE", description: "SECRET DESCRIPTION", start: new Date("2026-06-24T23:00:00Z"), end: new Date("2026-06-25T00:30:00Z") } as Meeting;
    const folders = { bylaws: downResult("b"), meetings: okResult("m", []), presentations: okResult("p", []), letters: downResult("l"), neighborhoodPlan: downResult("n") };
    const html = await render([past], { folders });
    // The past row must exist, or the absence check below proves nothing.
    expect(html).toContain('role="table"');
    expect(html).toContain("June 24, 2026");
    expect(html).not.toContain("SECRET");
  });
});

describe("documents page", () => {
  const render = (folders?: Record<string, FolderResult>): Promise<string> => {
    home.meetings = [];
    home.calendarOk = true;
    home.folders = folders;
    home.buildRows = false;
    return container.renderToString(Documents, { request: new Request("https://arlingtonview.org/documents/") });
  };
  const main = (html: string): string => html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const ids = ["bylaws", "minutes", "presentations", "letters", "neighborhood-plan"];
  const headings = ["Bylaws", "Minutes and agendas", "Presentations", "Official letters", "Neighborhood Plan"];

  it("renders all five sections in order, each with the fallback, when every folder is down", async () => {
    const html = main(await render());
    for (const id of ids) expect(html).toContain(`<section id="${id}"`);
    const at = headings.map((h) => html.search(new RegExp(`<h2[^>]*>${h}</h2>`)));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(countOf(html, "Open folder in Google Drive")).toBe(5);
    for (const heading of headings) expect(html, heading).toContain(folderLink("https://example.test/f", heading));
    expect(countOf(html, "The file list is not available right now.")).toBe(5);
    expect(html).not.toMatch(/survey/i);
    expect(html).not.toContain("<table");
  });

  it("links the current bylaws PDF from settings even when the folder is down, and lists in-page links", async () => {
    const html = main(await render());
    expect(html).toContain(
      `<a href="https://drive.google.com/file/d/${settings.drive.bylawsCurrentFileId}/view">Current bylaws (PDF)</a>`,
    );
    for (const id of ids) expect(html).toContain(`href="#${id}"`);
    expect(html.indexOf('href="#bylaws"')).toBeLessThan(html.indexOf('<section id="bylaws"'));
    // One wrapping row of links, not a vertical list.
    const nav = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/);
    expect(nav).not.toBeNull();
    expect(nav![0]).toContain('class="actions"');
    expect(nav![0]).not.toContain("<ul");
    expect(hrefs(nav![1])).toEqual(ids.map((id) => `#${id}`));
    expect([...nav![1].matchAll(/<a[^>]*>([^<]*)<\/a>/g)].map((m) => m[1])).toEqual(headings);
  });

  it("renders folders shaped like the owner's Drive", async () => {
    const current = driveFile(`AVCA By-Laws (June 24th, 2026).pdf`, [], { id: settings.drive.bylawsCurrentFileId, mimeType: PDF });
    const folders = {
      bylaws: okResult("b", [
        current,
        driveFile("AVCA By-Laws (June 24th, 2026)", []),
        folderEntry("Old Bylaws"),
        driveFile("Bylaws 2019", ["Old Bylaws"]),
        driveFile("Bylaws 2019.pdf", ["Old Bylaws"], { mimeType: PDF }),
        driveFile("Proposed Amendment 2026", ["Proposed Amendments"]),
      ]),
      meetings: okResult("m", [
        folderEntry("2026-2027"),
        driveFile("AVCA Monthly Meeting Proposed Agenda - October 20, 2026", ["2026-2027", "26 10 October"]),
        driveFile("AVCA 2026 Sep mtg mins (draft)", ["2026-2027", "26 10 October"]),
        driveFile("AVCA 2025 Jun mtg mins", ["2025-2026", "25 07 July"]),
        driveFile("(OLD) AVCA 2025 Feb mtg mins", ["2024-2025", "25 03 March"]),
      ]),
      presentations: okResult("p", [driveFile("Zoning deck 2026-03-03", [])]),
      letters: okResult("l", [driveFile("2025-03-03 Statement of Neutrality S Pierce Street Discussions.pdf", ["2024 - 2025"], { mimeType: PDF })]),
      neighborhoodPlan: okResult("n", [driveFile("Neighborhood Conservation Plan.pdf", [], { mimeType: PDF })]),
    };
    const html = main(await render(folders));
    expect(countOf(html, "Current bylaws (PDF)")).toBe(1);
    // The current PDF is linked once, above; it is not repeated in the list.
    expect(countOf(html, "AVCA By-Laws (June 24th, 2026)")).toBe(0);
    expect(countOf(html, ">Bylaws 2019")).toBe(1);
    expect(html).toContain("Bylaws 2019.pdf</a>");
    expect(html).toMatch(/<h3[^>]*>Proposed Amendments<\/h3>/);
    expect(html.indexOf("Proposed Amendments")).toBeLessThan(html.indexOf("Old Bylaws</h3>"));
    expect(html.indexOf("2026-2027</h3>")).toBeLessThan(html.indexOf("2025-2026</h3>"));
    expect(html).toContain("AVCA 2026 Sep mtg mins (draft)</a>");
    expect(html).not.toContain("(OLD)");
    expect(html).toContain("Zoning deck 2026-03-03</a>");
    // Every rendered list sits in a group capped at a readable width.
    expect(classTokens(html).filter((c) => c === "file-group").length).toBe(countOf(html, '<ul class="files"'));
    expect(html).toContain("Statement of Neutrality S Pierce Street Discussions.pdf</a>");
    expect(html).toContain("Neighborhood Conservation Plan.pdf</a>");
    expect(countOf(html, "Open folder in Google Drive")).toBe(5);
    const linkNames = [...html.matchAll(/Open folder in Google Drive<span class="visually-hidden">, ([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(linkNames).toEqual(headings);
    expect(countOf(html, "not available right now")).toBe(0);
    expect(html).not.toMatch(/survey/i);
  });

  it("follows the newest top-level PDF when bylawsCurrentFileId is not in the folder, and does not list it twice", async () => {
    const replaced = driveFile("AVCA By-Laws (June 30th, 2027).pdf", [], { mimeType: PDF });
    const previous = driveFile("AVCA By-Laws (June 24th, 2026).pdf", [], { mimeType: PDF });
    const folders = {
      bylaws: okResult("b", [previous, replaced, driveFile("Bylaws 2019.pdf", ["Old Bylaws"], { mimeType: PDF })]),
      meetings: downResult("m"),
      presentations: downResult("p"),
      letters: downResult("l"),
      neighborhoodPlan: downResult("n"),
    };
    const html = main(await render(folders));
    expect(html).toContain(`<a href="https://drive.google.com/file/d/${replaced.id}/view">Current bylaws (PDF)</a>`);
    expect(html).not.toContain(settings.drive.bylawsCurrentFileId);
    expect(countOf(html, "AVCA By-Laws (June 30th, 2027).pdf")).toBe(0);
    expect(countOf(html, "AVCA By-Laws (June 24th, 2026).pdf</a>")).toBe(1);
  });

  it("keeps one h1, no script, no new-tab links, and the Documents title", async () => {
    const html = await render();
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(html).toContain("<title>Documents | ");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("target=");
  });
});

/** Text content with every tag read as a word break, so adjacent cells do not run together. */
const spaced = (html: string): string => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("BoardTable", () => {
  const board: Board = {
    term: { start: "2026-09", end: "2028-08" },
    officers: [
      { role: "President Emeritus", name: "C. Example", kind: "honorary" },
      { role: "ArNAC Representative", name: "D. Sample", kind: "appointed" },
      { role: "President", name: "A. Resident", kind: "elected" },
      { role: "Parliamentarian", name: "Vacant", kind: "elected" },
    ],
    blockCaptains: [
      { block: 1, names: ["D. Sample"] },
      { block: 4, names: [] },
      { block: 7, names: ["E. Person", "F. Person"] },
    ],
  };
  const email = "president@example.test";
  const render = (b: Board) => container.renderToString(BoardTable, { props: { board: b, contactEmail: email } });
  const headings = (html: string, level: number): string[] =>
    [...html.matchAll(new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "g"))].map((m) => textOf(m[1]));

  it("shows the term as September 2026 to August 2028", async () => {
    expect(textOf(await render(board))).toContain("Term: September 2026 to August 2028");
  });

  it("has no term line without a term", async () => {
    expect(await render({ ...board, term: undefined })).not.toContain("Term:");
  });

  it("groups officers as Elected officers, Appointed, Honorary, in that order", async () => {
    const html = await render(board);
    expect(headings(html, 3)).toEqual(["Elected officers", "Appointed", "Honorary"]);
    expect(html.indexOf("A. Resident")).toBeLessThan(html.indexOf("D. Sample"));
    expect(html.indexOf("D. Sample")).toBeLessThan(html.indexOf("C. Example"));
  });

  it("omits a group with no members", async () => {
    const html = await render({ ...board, officers: board.officers.filter((o) => o.kind !== "appointed") });
    expect(headings(html, 3)).toEqual(["Elected officers", "Honorary"]);
    expect(html).not.toContain("Appointed");
  });

  it("lists each role with its name, and marks a vacant office", async () => {
    const html = await render(board);
    expect(html).toMatch(/<dt[^>]*>\s*President\s*<\/dt>\s*<dd[^>]*>\s*A. Resident\s*<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>\s*Parliamentarian\s*<\/dt>\s*<dd[^>]*>\s*<span class="soft">Vacant<\/span>/);
  });

  it("lists block captains, with Vacant for an empty block, and recruits when one is vacant", async () => {
    const html = await render(board);
    expect(headings(html, 2)).toContain("Block captains");
    const text = spaced(html);
    expect(text).toContain("Block 1 D. Sample");
    expect(text).toContain("Block 4 Vacant");
    expect(text).toContain("Block 7 E. Person, F. Person");
    expect(text).toContain("Some blocks need a captain. If you are interested in serving, contact the president at");
    expect(html).toContain(`<a href="mailto:${email}">${email}</a>`);
  });

  it("drops the recruiting sentence when every block has a captain", async () => {
    const html = await render({
      ...board,
      officers: board.officers.filter((o) => o.name !== "Vacant"),
      blockCaptains: [{ block: 1, names: ["D. Sample"] }],
    });
    expect(html).not.toContain("need a captain");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("Vacant");
  });

  it("renders whatever roster is committed, without pinning it", async () => {
    // The committed file is owner-edited content: assert the rules (grouping, vacancies, term), not the values.
    const real = await getBoard();
    const html = await container.renderToString(BoardTable, { props: { board: real, contactEmail: settings.contactEmail } });
    // Names such as "O'Brien" are escaped in markup; compare the decoded text.
    const text = spaced(html).replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    const expectedHeadings = [
      ["elected", "Elected officers"],
      ["appointed", "Appointed"],
      ["honorary", "Honorary"],
    ].filter(([kind]) => real.officers.some((o) => o.kind === kind)).map(([, title]) => title);
    expect(headings(html, 3)).toEqual(expectedHeadings);
    for (const o of real.officers) expect(text).toContain(`${o.role} ${o.name}`);
    for (const b of real.blockCaptains) expect(text).toContain(`Block ${b.block} ${b.names.length === 0 ? "Vacant" : b.names.join(", ")}`);
    expect(text.includes("need a captain")).toBe(real.blockCaptains.some((b) => b.names.length === 0));
    expect(text.includes("Term:")).toBe(real.term !== undefined);
  });
});

describe("LinkGroups", () => {
  it("renders one h2 per group, https links without target, and notes as plain text", async () => {
    const groups = await getResources();
    const html = await container.renderToString(LinkGroups, { props: { groups } });
    expect([...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => textOf(m[1]))).toEqual(groups.map((g) => g.title));
    const links = hrefs(html);
    expect(links).toHaveLength(groups.flatMap((g) => g.links).length);
    for (const href of links) expect(href.startsWith("https://"), href).toBe(true);
    expect(html).not.toContain("target=");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("<script");
  });

  it("shows a note as plain text beside its link, never inside the link or as a tel: link", async () => {
    const groups = [
      { title: "G", links: [{ label: "Report a thing", url: "https://example.org/a", note: "555-0100" }, { label: "Plain", url: "https://example.org/b" }] },
    ];
    const html = await container.renderToString(LinkGroups, { props: { groups } });
    expect(spaced(html)).toContain("Report a thing 555-0100");
    expect(html).not.toMatch(/<a[^>]*>[^<]*555-/);
    expect(html).not.toContain("tel:");
  });
});

describe("JoinAction", () => {
  const render = (joinFormUrl: string) =>
    container.renderToString(JoinAction, { props: { contactEmail: "president@example.test", joinFormUrl } });

  it("offers a button to email the president when there is no form", async () => {
    const html = await render("");
    expect(html).toMatch(/<a class="button" href="mailto:president@example\.test">Email the president<\/a>/);
    // The address itself is visible, so a reader can copy it.
    expect(html).toMatch(/<a href="mailto:president@example\.test">president@example\.test<\/a>/);
    expect(html).not.toContain("membership form");
  });

  it("treats a blank-looking form URL as no form", async () => {
    const html = await render("  ");
    expect(html).toContain("Email the president");
    expect(html).not.toContain("membership form");
  });

  it("offers the form as the button, and the email as a plain link, when a form exists", async () => {
    const html = await render("https://forms.example.test/join");
    expect(html).toMatch(/<a class="button" href="https:\/\/forms\.example\.test\/join">Open the membership form<\/a>/);
    expect(html).toMatch(/<a href="mailto:president@example\.test">president@example\.test<\/a>/);
    expect(html).not.toContain('class="button" href="mailto:');
    expect(html).not.toContain("target=");
  });
});

describe("formatTermMonth", () => {
  it("formats YYYY-MM as a month name and year", () => {
    expect(formatTermMonth("2026-09")).toBe("September 2026");
    expect(formatTermMonth("2028-08")).toBe("August 2028");
    expect(formatTermMonth("2027-01")).toBe("January 2027");
    expect(formatTermMonth("2027-12")).toBe("December 2027");
  });

  it("throws a clear error for a month outside 01 to 12", () => {
    for (const bad of ["2026-00", "2026-13", "2026-9", "2026", "September 2026"]) {
      expect(() => formatTermMonth(bad), bad).toThrow(/expected YYYY-MM/);
    }
  });
});

describe("photosFromModules", () => {
  const mod = (image: unknown) => ({ default: image as ImageMetadata });

  it("reads the year from each file name and sorts ascending", () => {
    const photos = photosFromModules({
      "../../assets/history/AVCA_1956.png": mod(img1956),
      "../../assets/history/AVCA_1934.png": mod(img1934),
    });
    expect(photos.map((p) => p.year)).toEqual(["1934", "1956"]);
  });

  it("throws, naming the file, when the name is not AVCA_<year>.png", () => {
    expect(() => photosFromModules({ "../../assets/history/map-1934.png": mod(img1934) })).toThrow(/map-1934\.png.*AVCA_<year>\.png/);
  });
});

describe("History page", () => {
  const years = ["1934", "1956", "1962", "1969", "1974", "1983", "1989"];
  const photos = years.map((year, i) => ({ year, image: i % 2 === 0 ? img1934 : img1956 }));
  const render = () => container.renderToString(HistoryPhotos, { props: { photos } });

  it("renders seven figures in ascending year order, each with alt text and a year caption", async () => {
    const html = await render();
    const figures = [...html.matchAll(/<figure[^>]*>([\s\S]*?)<\/figure>/g)].map((m) => m[1]);
    expect(figures).toHaveLength(7);
    figures.forEach((fig, i) => {
      expect(fig).toContain(`alt="Aerial photograph of Arlington View, ${years[i]}"`);
      expect(fig).toMatch(new RegExp(`<figcaption[^>]*>${years[i]}</figcaption>`));
    });
  });

  it("loads the first image eagerly and the rest lazily, with explicit width and height", async () => {
    const imgs = [...(await render()).matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(imgs).toHaveLength(7);
    imgs.forEach((tag, i) => {
      expect(tag).toContain(i === 0 ? 'loading="eager"' : 'loading="lazy"');
      expect(tag).toMatch(/\swidth="\d+"/);
      expect(tag).toMatch(/\sheight="\d+"/);
      expect(tag).toContain("f=webp");
    });
  });

  it("links the Drive history folder by ID, and omits the link when the ID is blank or whitespace", async () => {
    const link = (folderId: string) => container.renderToString(HistoryFolderLink, { props: { folderId } });
    const html = await link("abc123");
    expect(html).toContain('href="https://drive.google.com/drive/folders/abc123"');
    expect(html).toContain("Open the history folder in Google Drive");
    expect(html).not.toContain("target=");
    for (const blank of ["", "   "]) expect((await link(blank)).trim(), JSON.stringify(blank)).toBe("");
  });

  it("builds the page with one h1, no script, no new-tab links", async () => {
    const html = await container.renderToString(History, { request: new Request("https://arlingtonview.org/about/history/") });
    expect(countOf(html, "<h1")).toBe(1);
    expect(html).toContain("<title>History | ");
    expect(countOf(html, "<figure")).toBe(7);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("target=");
  });
});
