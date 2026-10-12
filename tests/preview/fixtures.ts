/**
 * Fixture data for the browser-test previews (see previews.preview.ts and tests/e2e/README.md).
 *
 * Everything here is invented: Drive IDs are `fixtureNNN`, names are the repo's own published document
 * titles or generic ones, and every date is a fixed literal or computed from one, never from the clock.
 * `FIXTURE_NOW` is the "current time" the previews are rendered at.
 */
import type { Meeting } from "../../src/lib/calendar";
import type { DriveFile, DriveRoot, FolderResult } from "../../src/lib/drive";
import { parseMeetingDate } from "../../src/lib/meetingDate";
import type { Settings } from "../../src/lib/settings";

export const FIXTURE_NOW = new Date("2026-10-12T16:00:00Z");

/**
 * Settings for the previews. Invented, not read from src/content/settings.yaml: owner edits to that file
 * must never change (or break) the previews.
 */
export const FIXTURE_SETTINGS: Settings = {
  siteName: "Fixture Association",
  shortName: "FA",
  siteUrl: "https://fixture.example.org",
  contactEmail: "board@fixture.example.org",
  calendarId: "fixture-calendar@group.calendar.google.com",
  meetingRule: "Meetings are held on the last Tuesday of the month, unless otherwise noted.",
  virtualLinkNote: "The virtual meeting link is sent by email. Write to us if you need it.",
  joinFormUrl: "",
  drive: {
    bylaws: "fixturebylaws",
    bylawsCurrentFileId: "fixturebylawscurrent",
    meetings: "fixturemeetings",
    presentations: "fixturepresentations",
    letters: "fixtureletters",
    neighborhoodPlan: "fixtureplan",
    history: "fixturehistory",
  },
};

export type Scenario = {
  /** Directory under dist/_preview/ and the route the page is rendered for. */
  slug: "home-virtual" | "home-in-person" | "meetings" | "documents";
  meetings: Meeting[];
  folders: Record<DriveRoot, FolderResult>;
};

const DOC = "application/vnd.google-apps.document";
const PDF = "application/pdf";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (x: number): string => String(x).padStart(2, "0");

/** A name with no break opportunity (no space or hyphen), at least `min` characters: the worst case for a phone. */
function unbroken(text: string, min: number): string {
  if (text.length < min || /[\s-]/.test(text)) throw new Error(`fixture "${text}" must be ${min}+ characters with no space or hyphen`);
  return text;
}
/** A real file name from the owner's Drive (Bylaws > Proposed Amendments): 43 characters, unbreakable. */
export const LONG_REAL_NAME = unbroken("AVCA_Article_V_Section_1_proposed_amendment", 43);
/** Exactly 60 characters, unbreakable; a material on the August 2025 meeting row. */
export const LONG_MATERIAL_NAME = unbroken("Traffic_Calming_Study_Appendix_B_Speed_And_Volume_Counts_v02", 60);
/** A location pasted as one unbroken string: the home notice's place line and the schedule's place text. */
export const LONG_LOCATION = unbroken("Carver_Community_Center_Multipurpose_Room_East_Entrance_Second_Floor", 60);

/** Sequential, obviously fake Drive IDs, restarted per build so previews are byte-stable. */
function idMaker(): () => string {
  let n = 0;
  return () => `fixture${String(++n).padStart(3, "0")}`;
}

function file(nextId: () => string, name: string, path: string[] = [], extra: Partial<DriveFile> = {}): DriveFile {
  const id = nextId();
  const parsed = parseMeetingDate(name);
  return {
    id,
    name,
    mimeType: DOC,
    modifiedTime: "2026-09-01T12:00:00.000Z",
    url: `https://drive.google.com/file/d/${id}/view`,
    isFolder: false,
    path,
    ...(parsed ? { meetingDate: parsed.date, approximate: parsed.approximate } : {}),
    ...extra,
  };
}

const folderOf = (id: string, files: DriveFile[]): FolderResult => ({
  ok: true,
  files,
  folderUrl: `https://drive.google.com/drive/folders/${id}`,
});

/** Day of the last Tuesday of month `m` (1-based) in year `y`. */
function lastTuesday(y: number, m: number): number {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = last; d > 0; d--) if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 2) return d;
  return last;
}

/** A 7 pm New York meeting on the last Tuesday of the month (DST resolved by Intl, not the clock). */
function meeting(y: number, m: number, virtual = true): Meeting {
  const d = lastTuesday(y, m);
  const nyHour = (offset: number): number =>
    Number(
      new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(
        new Date(Date.UTC(y, m - 1, d, 19 + offset)),
      ),
    );
  const start = new Date(Date.UTC(y, m - 1, d, 19 + (nyHour(4) === 19 ? 4 : 5)));
  return {
    uid: `fixture-${y}-${pad(m)}`,
    start,
    end: new Date(start.getTime() + 90 * 60_000),
    title: "AVCA Monthly Meeting",
    isVirtual: virtual,
    ...(virtual ? {} : { location: "Arlington Central Library, Room 201" }),
  };
}

const membershipYear = (y: number, m: number): string => (m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`);
const monthFolder = (y: number, m: number): string => `${pad(y % 100)} ${pad(m)} ${MONTH[m - 1]}`;

/** Twenty-four past meetings, Oct 2024 to Sep 2026, and the Drive files that go with them. */
function archive(nextId: () => string): { past: Meeting[]; files: DriveFile[] } {
  const past: Meeting[] = [];
  const files: DriveFile[] = [];
  for (let i = 0; i < 24; i++) {
    const idx = 2024 * 12 + 9 + i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    past.push(meeting(y, m, i % 5 !== 0));
    const d = lastTuesday(y, m);
    if (i % 7 !== 3) files.push(file(nextId, `AVCA Proposed Agenda ${pad(m)}.${pad(d)}.${y}`, [membershipYear(y, m), monthFolder(y, m)]));
    // Minutes of this meeting are filed in the next month's folder.
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const draft = i === 23;
    if (i % 6 !== 4) {
      files.push(file(nextId, `AVCA ${y} ${MON[m - 1]} mtg mins${draft ? " (draft)" : ""}`, [membershipYear(ny, nm), monthFolder(ny, nm)]));
    }
  }
  // Hidden by the "(OLD)" rule.
  files.push(file(nextId, "(OLD) AVCA 2025 Feb mtg mins", ["2024-2025", "25 03 March"]));
  // Materials on the March 2025 row, including a Google Doc/PDF twin.
  files.push(file(nextId, "Motion of Neutrality on S Pierce Street", ["2024-2025", "25 03 March"]));
  files.push(file(nextId, "2025-03-03 Statement of Neutrality S Pierce Street Discussions.pdf", ["2024-2025", "25 03 March"], { mimeType: PDF }));
  // A folder entry: it must never be listed.
  files.push(file(nextId, "Scans to sort", ["2024-2025"], { isFolder: true, mimeType: "application/vnd.google-apps.folder" }));
  // An agenda for a meeting that has not happened yet, with no minutes.
  files.push(file(nextId, "AVCA Monthly Meeting Proposed Agenda - October 27, 2026", ["2026-2027", "26 10 October"]));
  // Materials on the August 2025 row; the second has a long name with no break opportunity.
  files.push(file(nextId, "AVCA 2025 Aug special session notes", ["2024-2025", "25 08 August"]));
  files.push(file(nextId, LONG_MATERIAL_NAME, ["2024-2025", "25 08 August"]));
  // A month-only name in a month with no calendar meeting: the row is approximate.
  files.push(file(nextId, "AVCA Meeting Agenda - June 2024", ["2023-2024", "24 06 June"]));
  return { past, files };
}

function folders(): Record<DriveRoot, FolderResult> {
  const nextId = idMaker();
  const { files } = archive(nextId);
  return {
    bylaws: folderOf("fixturefolder-bylaws", [
      file(nextId, "AVCA By-Laws (June 24th, 2026).pdf", [], { id: "fixturebylawscurrent", mimeType: PDF }),
      file(nextId, "AVCA By-Laws (June 24th, 2026)", []),
      file(nextId, "Proposed Amendment to Article IV, Membership and Dues, Draft of May 2026", ["Proposed Amendments"]),
      file(nextId, "Proposed Amendment 2026-05-12.pdf", ["Proposed Amendments"], { mimeType: PDF }),
      file(nextId, "Proposed Amendment 2026-05-12", ["Proposed Amendments"]),
      file(nextId, LONG_REAL_NAME, ["Proposed Amendments"]),
      file(nextId, "AVCA By-Laws (2019)", ["Old Bylaws"]),
      file(nextId, "AVCA By-Laws (2011).pdf", ["Old Bylaws"], { mimeType: PDF }),
      file(nextId, "(OLD) AVCA By-Laws (2004)", ["Old Bylaws"]),
      file(nextId, "Superseded drafts", [], { isFolder: true, mimeType: "application/vnd.google-apps.folder" }),
    ]),
    meetings: folderOf("fixturefolder-meetings", files),
    presentations: folderOf("fixturefolder-presentations", [
      file(nextId, "Arlington County Zoning Study Presentation 2026-03-31.pdf", [], { mimeType: PDF }),
      file(nextId, "Neighborhood Conservation Plan Update, County Staff Briefing 2025-09-30.pdf", [], { mimeType: PDF }),
      file(nextId, "Capital Improvement Plan Overview 2024-11-26.pdf", [], { mimeType: PDF }),
    ]),
    letters: folderOf("fixturefolder-letters", [
      file(nextId, "2026-02-10 Comments on Columbia Pike Streetscape.pdf", ["2025 - 2026"], { mimeType: PDF }),
      file(nextId, "2025-11-04 Letter to County Board on Four Mile Run Park.pdf", ["2025 - 2026"], { mimeType: PDF }),
      file(nextId, "2025-03-03 Statement of Neutrality S Pierce Street Discussions.pdf", ["2024 - 2025"], { mimeType: PDF }),
      file(nextId, "2025-01-14 Support for Traffic Calming on S Glebe Rd.pdf", ["2024 - 2025"], { mimeType: PDF }),
      file(nextId, "2024-10-08 Letter on Arlington View Dog Park.pdf", ["2024 - 2025"], { mimeType: PDF }),
    ]),
    neighborhoodPlan: folderOf("fixturefolder-plan", [
      file(nextId, "Arlington View Neighborhood Conservation Plan (2019).pdf", [], { mimeType: PDF }),
      // No date in the name: the file shows "Updated <modified date>".
      file(nextId, "Arlington View Neighborhood Plan, Appendix A: Historic Resources Survey Summary", []),
    ]),
  };
}

export function scenarios(): Scenario[] {
  const { past } = archive(idMaker());
  const upcomingSix = [
    meeting(2026, 10),
    meeting(2026, 11),
    meeting(2026, 12),
    meeting(2027, 1, false),
    meeting(2027, 2),
    meeting(2027, 3),
  ];
  const [next, ...rest] = upcomingSix;
  if (!next) throw new Error("no upcoming fixture meetings");
  // In person, at a location with no break opportunity: the hero of home-in-person and the first row of
  // the Meetings schedule, so the 320px no-horizontal-scroll checks cover both place lines.
  const inPerson: Meeting = { ...next, isVirtual: false, location: LONG_LOCATION };
  return [
    { slug: "home-virtual", meetings: [...past, next, ...rest], folders: folders() },
    { slug: "home-in-person", meetings: [...past, inPerson, ...rest], folders: folders() },
    { slug: "meetings", meetings: [...past, inPerson, ...rest], folders: folders() },
    { slug: "documents", meetings: [...past, ...upcomingSix], folders: folders() },
  ];
}
