import { describe, expect, it } from "vitest";
import {
  agendaFor,
  buildArchive,
  classify,
  folderMonth,
  groupByPath,
  groupByYear,
  pastRows,
  preferPdfTwins,
  recentFiles,
  visibleFiles,
  type ArchiveRow,
} from "../src/lib/archive";
import type { Meeting } from "../src/lib/calendar";
import type { DriveFile, FolderResult } from "../src/lib/drive";
import { parseMeetingDate } from "../src/lib/meetingDate";

let counter = 0;
function file(name: string, path: string[] = [], extra: Partial<DriveFile> = {}): DriveFile {
  const id = `id-${String(++counter).padStart(4, "0")}`;
  const parsed = parseMeetingDate(name);
  return {
    id,
    name,
    mimeType: "application/vnd.google-apps.document",
    modifiedTime: "2026-01-01T00:00:00.000Z",
    url: `https://example.test/view/${id}`,
    isFolder: false,
    path,
    ...(parsed ? { meetingDate: parsed.date, approximate: parsed.approximate } : {}),
    ...extra,
  };
}

// 19:00-20:30 America/New_York (EDT from 2026-03-08 to 2026-10-31, EST otherwise).
function meeting(date: string, extra: Partial<Meeting> = {}): Meeting {
  const [y, m, d] = date.split("-").map(Number);
  const dst = date >= "2026-03-08" && date < "2026-11-01";
  const offset = dst ? 4 : 5;
  const start = new Date(Date.UTC(y, m - 1, d, 19 + offset, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 20 + offset, 30));
  return { uid: `uid-${date}`, start, end, title: "AVCA Monthly Meeting", isVirtual: false, ...extra };
}

const ok = (files: DriveFile[]): FolderResult => ({ ok: true, files, folderUrl: "https://drive.google.com/drive/folders/x" });
const failed: FolderResult = { ok: false, folderUrl: "https://drive.google.com/drive/folders/x", reason: "HTTP 500" };
const none = ok([]);
const rowOn = (rows: ArchiveRow[], date: string) => rows.find((r) => r.date === date);
const dates = (rows: ArchiveRow[]) => rows.map((r) => r.date);

const SEP = ["2026-2027", "26 09 September"];
const OCT = ["2026-2027", "26 10 October"];
const JUN = ["2025-2026", "26 06 June"];
const MAY = ["2025-2026", "26 05 May"];

function scenarioA() {
  const files = {
    sepAgenda: file("AVCA Monthly Meeting Proposed Agenda - September 29, 2026", SEP),
    juneMins: file("AVCA 2026 June mtg mins", SEP),
    octAgenda: file("AVCA Monthly Meeting Proposed Agenda - October 20, 2026", OCT),
    sepMins: file("AVCA 2026 Sep mtg mins (draft)", OCT),
    junAgenda: file("AVCA Proposed Agenda 06.24.2026", JUN),
    mayMins: file("AVCA 2026 May mtg mins", JUN),
    mayAgenda: file("AVCA Proposed Agenda 05.27.2026", MAY),
  };
  const meetings = [meeting("2026-09-29"), meeting("2026-10-20"), meeting("2026-11-17")];
  return { files, meetings, list: Object.values(files) };
}

describe("scenario A: September-October 2026", () => {
  const { files, meetings, list } = scenarioA();
  const rows = buildArchive(meetings, { meetings: ok(list), presentations: none });

  it("returns the expected rows, newest first", () => {
    expect(dates(rows)).toEqual(["2026-11-17", "2026-10-20", "2026-09-29", "2026-06-24", "2026-05-27"]);
  });

  it("leaves a future meeting without files", () => {
    const row = rowOn(rows, "2026-11-17")!;
    expect(row.meeting).toBe(meetings[2]);
    expect(row.agenda).toBeUndefined();
    expect(row.minutes).toBeUndefined();
    expect(row.materials).toEqual([]);
    expect(row.approximate).toBe(false);
  });

  it("attaches the October agenda and no minutes to 2026-10-20", () => {
    const row = rowOn(rows, "2026-10-20")!;
    expect(row.meeting).toBe(meetings[1]);
    expect(row.agenda).toBe(files.octAgenda);
    expect(row.minutes).toBeUndefined();
  });

  it("puts the draft September minutes on the September meeting row", () => {
    const row = rowOn(rows, "2026-09-29")!;
    expect(row.agenda).toBe(files.sepAgenda);
    expect(row.minutes).toBe(files.sepMins);
    expect(row.minutesDraft).toBe(true);
  });

  it("dates June minutes by their filename, not the September folder they sit in", () => {
    const row = rowOn(rows, "2026-06-24")!;
    expect(row.meeting).toBeUndefined();
    expect(row.agenda).toBe(files.junAgenda);
    expect(row.minutes).toBe(files.juneMins);
    expect(row.minutesDraft).toBe(false);
    expect(row.approximate).toBe(false);
  });

  it("builds the May row from the agenda and the May minutes", () => {
    const row = rowOn(rows, "2026-05-27")!;
    expect(row.agenda).toBe(files.mayAgenda);
    expect(row.minutes).toBe(files.mayMins);
  });

  it("pastRows keeps rows before today (New York)", () => {
    const now = new Date("2026-10-12T12:00:00-04:00");
    expect(dates(pastRows(rows, now))).toEqual(["2026-09-29", "2026-06-24", "2026-05-27"]);
  });

  it("agendaFor prefers the Drive agenda, then the calendar link, then nothing", () => {
    expect(agendaFor(meeting("2026-10-20"), rows)).toBe(files.octAgenda.url);
    const withLink = meeting("2026-11-17", { agendaUrl: "https://docs.google.com/x" });
    expect(agendaFor(withLink, rows)).toBe("https://docs.google.com/x");
    expect(agendaFor(meeting("2026-11-17"), rows)).toBeUndefined();
  });
});

describe("scenario B: March 2025 folder", () => {
  const feb = ["2024-2025", "25 02 February"];
  const mar = ["2024-2025", "25 03 March"];
  const files = {
    febAgenda: file("AVCA Proposed Agenda 02.26.2025", feb),
    oldMins: file("(OLD) AVCA 2025 Feb mtg mins", mar),
    febMins: file("AVCA 2025 Feb mtg mins", mar),
    marAgenda: file("AVCA Proposed Agenda 03.26.2025", mar),
    statement: file("2025-03-03 Statement of Neutrality S Pierce Street Discussions.pdf", mar),
    motion: file("Motion of Neutrality on S Pierce Street", mar),
  };
  const list = Object.values(files);
  const rows = buildArchive([], { meetings: ok(list), presentations: none });

  it("produces the two expected rows", () => {
    expect(dates(rows)).toEqual(["2025-03-26", "2025-02-26"]);
  });

  it("attaches exact-dated then folder-dated materials to the only March row", () => {
    const row = rowOn(rows, "2025-03-26")!;
    expect(row.agenda).toBe(files.marAgenda);
    expect(row.minutes).toBeUndefined();
    expect(row.materials).toEqual([files.statement, files.motion]);
  });

  it("uses the non-(OLD) February minutes", () => {
    const row = rowOn(rows, "2025-02-26")!;
    expect(row.agenda).toBe(files.febAgenda);
    expect(row.minutes).toBe(files.febMins);
  });

  it("shows the (OLD) file nowhere", () => {
    const everywhere = rows.flatMap((r) => [r.agenda, r.minutes, ...r.materials]);
    expect(everywhere).not.toContain(files.oldMins);
    expect(recentFiles([ok(list)], 10)).not.toContain(files.oldMins);
  });
});

describe("scenario C: month-rule edges", () => {
  it("C1: two rows in a month leave month-level files unattached", () => {
    const material = file("Parking study 2026-03-20", ["2025-2026", "26 03 March"]);
    const mins = file("AVCA 2026 Mar mtg mins", ["2025-2026", "26 03 March"]);
    const rows = buildArchive([meeting("2026-03-10"), meeting("2026-03-31")], {
      meetings: ok([material, mins]),
      presentations: none,
    });
    expect(dates(rows)).toEqual(["2026-03-31", "2026-03-10"]);
    for (const row of rows) {
      expect(row.materials).toEqual([]);
      expect(row.minutes).toBeUndefined();
    }
  });

  it("C2: approximate minutes with no row that month create an approximate row", () => {
    const mins = file("AVCA 2023 Apr mtg mins", ["2022-2023", "23 05 May"]);
    const rows = buildArchive([], { meetings: ok([mins]), presentations: none });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2023-04-01", approximate: true, minutes: mins, minutesDraft: false });
  });

  it("C3: an undated material with no row that month creates no row", () => {
    const notes = file("Budget notes", ["2022-2023", "23 04 April"]);
    expect(buildArchive([], { meetings: ok([notes]), presentations: none })).toEqual([]);
  });

  it("C4: undated minutes are never dated by their folder", () => {
    const mins = file("AVCA Meeting Minutes", ["2022-2023", "23 04 April"]);
    expect(buildArchive([], { meetings: ok([mins]), presentations: none })).toEqual([]);
    const rows = buildArchive([meeting("2023-04-26")], { meetings: ok([mins]), presentations: none });
    expect(rows).toHaveLength(1);
    expect(rows[0].minutes).toBeUndefined();
    expect(rows[0].materials).toEqual([]);
  });

  it("C5: the non-draft agenda wins the slot and the draft becomes a material", () => {
    const path = ["2025-2026", "25 10 October"];
    const draft = file("AVCA Proposed Agenda 10.21.2025 (draft)", path, { modifiedTime: "2025-10-01T00:00:00.000Z" });
    const final = file("AVCA Proposed Agenda 10.21.2025", path, { modifiedTime: "2025-09-01T00:00:00.000Z" });
    const rows = buildArchive([], { meetings: ok([draft, final]), presentations: none });
    expect(rows).toHaveLength(1);
    expect(rows[0].agenda).toBe(final);
    expect(rows[0].materials).toEqual([draft]);
  });

  it("C5b: with equal draft status the newest modifiedTime wins", () => {
    const older = file("Agenda 10.21.2025 a", [], { modifiedTime: "2025-09-01T00:00:00.000Z" });
    const newer = file("Agenda 10.21.2025 b", [], { modifiedTime: "2025-10-01T00:00:00.000Z" });
    const rows = buildArchive([], { meetings: ok([older, newer]), presentations: none });
    expect(rows[0].agenda).toBe(newer);
    expect(rows[0].materials).toEqual([older]);
  });

  it("C6: presentations attach as materials by the same rules", () => {
    const agenda = file("AVCA Proposed Agenda 10.30.24", ["2024-2025", "24 10 October"]);
    const deck = file("CPMM Update - AVCA 2024-10-30");
    const zoning = file("ZONING PRESENTATION_ArlingtonView.pdf");
    const rows = buildArchive([], { meetings: ok([agenda]), presentations: ok([deck, zoning]) });
    expect(dates(rows)).toEqual(["2024-10-30"]);
    expect(rows[0].materials).toEqual([deck]);
  });

  it("C6b: a presentation never becomes the agenda or minutes", () => {
    const deck = file("Meeting Minutes review 2024-10-30");
    const rows = buildArchive([meeting("2024-10-30")], { meetings: none, presentations: ok([deck]) });
    expect(rows[0].minutes).toBeUndefined();
    expect(rows[0].materials).toEqual([deck]);
  });

  it("C7: a failed meetings folder still yields a row per calendar meeting", () => {
    const rows = buildArchive([meeting("2026-10-20"), meeting("2026-11-17")], { meetings: failed, presentations: failed });
    expect(dates(rows)).toEqual(["2026-11-17", "2026-10-20"]);
    for (const row of rows) {
      expect(row.agenda).toBeUndefined();
      expect(row.minutes).toBeUndefined();
      expect(row).toMatchObject({ materials: [], approximate: false });
    }
  });

  it("C8: pastRows includes today's row only once the meeting has ended", () => {
    const m = meeting("2026-10-20");
    const rows = buildArchive([m], { meetings: none, presentations: none });
    expect(pastRows(rows, new Date(m.start.getTime()))).toEqual([]);
    expect(pastRows(rows, new Date(m.end.getTime() - 60_000))).toEqual([]);
    expect(pastRows(rows, new Date(m.end.getTime() + 60_000))).toEqual(rows);
  });

  it("C9: a meeting whose end equals now counts as ended", () => {
    const m = meeting("2026-10-20");
    const rows = buildArchive([m], { meetings: none, presentations: none });
    expect(pastRows(rows, new Date(m.end.getTime()))).toEqual(rows);
  });

  it("C10: a file-only row dated today is past", () => {
    const f = file("AVCA Proposed Agenda 2026-10-20", OCT);
    const rows = buildArchive([], { meetings: ok([f]), presentations: none });
    expect(dates(rows)).toEqual(["2026-10-20"]);
    expect(rows[0].meeting).toBeUndefined();
    expect(pastRows(rows, new Date("2026-10-20T12:00:00-04:00"))).toEqual(rows);
  });
});

describe("row dates", () => {
  it("uses the New York date for a winter evening meeting (UTC is already the next day)", () => {
    const m = meeting("2026-12-15");
    expect(m.start.toISOString()).toBe("2026-12-16T00:00:00.000Z");
    const rows = buildArchive([m], { meetings: none, presentations: none });
    expect(dates(rows)).toEqual(["2026-12-15"]);
    const agenda = file("AVCA Proposed Agenda 12.15.2026", ["2026-2027", "26 12 December"]);
    const joined = buildArchive([m], { meetings: ok([agenda]), presentations: none });
    expect(joined).toHaveLength(1);
    expect(joined[0].agenda).toBe(agenda);
  });
});

describe("determinism", () => {
  function shuffle<T>(items: T[], seed: number): T[] {
    const out = [...items];
    let s = seed;
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) % 4294967296;
      const j = s % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  it("yields identical output for any input order", () => {
    const a = scenarioA();
    const mar = ["2024-2025", "25 03 March"];
    const extra = [
      file("AVCA Proposed Agenda 03.26.2025", mar),
      file("2025-03-03 Statement of Neutrality.pdf", mar),
      file("Motion of Neutrality", mar),
      file("Motion of Neutrality", mar),
      file("Appendix", mar),
      file("AVCA Proposed Agenda 03.26.2025 (draft)", mar),
      file("AVCA 2025 Feb mtg mins", mar),
      file("AVCA 2025 Feb mtg mins", mar),
      file("AVCA 2023 Apr mtg mins"),
      file("AVCA 2023 Apr minutes"),
    ];
    const decks = [file("Deck 2026-09-29"), file("Deck 2026-09-29"), file("Intro deck")];
    const all = [...a.list, ...extra];
    const baseline = buildArchive(a.meetings, { meetings: ok(all), presentations: ok(decks) });
    for (let seed = 1; seed <= 25; seed++) {
      const rows = buildArchive(shuffle(a.meetings, seed), {
        meetings: ok(shuffle(all, seed)),
        presentations: ok(shuffle(decks, seed + 100)),
      });
      expect(rows).toEqual(baseline);
    }
  });

  it("orders materials by date tier, then name, then id", () => {
    const path = ["2025-2026", "25 10 October"];
    const agenda = file("AVCA Proposed Agenda 10.21.2025", path);
    const exactB = file("B exhibit 2025-10-05", path);
    const exactA = file("A exhibit 2025-10-05", path);
    const approx = file("Zebra Oct 2025", path);
    const undated = file("Aardvark", path);
    const rows = buildArchive([], { meetings: ok([undated, approx, exactB, agenda, exactA]), presentations: none });
    expect(rows[0].materials).toEqual([exactA, exactB, approx, undated]);
  });
});

describe("classify", () => {
  const c = (name: string) => classify(file(name));
  it("recognises agendas", () => {
    expect(c("AVCA Monthly Meeting Proposed Agenda - October 20, 2026").kind).toBe("agenda");
    expect(c("Agendas and Minutes index").kind).toBe("agenda");
  });
  it("recognises minutes and drafts", () => {
    expect(c("AVCA 2026 Sep mtg mins (draft)")).toEqual({ kind: "minutes", draft: true, hidden: false });
    expect(c("AVCA Meeting Minutes 9.25.24").kind).toBe("minutes");
  });
  it("hides (OLD) files, ignoring case and leading whitespace", () => {
    expect(c("(OLD) AVCA 2025 Feb mtg mins").hidden).toBe(true);
    expect(c("  (old) something").hidden).toBe(true);
    expect(c("AVCA (OLD) thing").hidden).toBe(false);
  });
  it("treats everything else as material, matching whole words only", () => {
    expect(c("Motion of Neutrality on S Pierce Street").kind).toBe("material");
    expect(c("Administration notes").kind).toBe("material");
  });
});

describe("folderMonth", () => {
  it("reads YY MM Name folders", () => {
    expect(folderMonth(["2026-2027", "26 10 October"])).toBe("2026-10");
  });
  it("returns undefined when there is no month folder", () => {
    expect(folderMonth(["2024-2025"])).toBeUndefined();
    expect(folderMonth([])).toBeUndefined();
    expect(folderMonth(["x", "24 13 Nope"])).toBeUndefined();
  });
});

describe("groupByPath", () => {
  it("puts top-level files first and sorts labels descending", () => {
    const top = file("Top");
    const old = file("Old", ["2025-2026"]);
    const cur = file("Cur", ["2026-2027", "26 10 October"]);
    const groups = groupByPath([old, cur, top]);
    expect(groups.map((g) => g.label)).toEqual(["", "2026-2027", "2025-2026"]);
    expect(groups[1].files).toEqual([cur]);
  });
  it("groups by the first `depth` segments", () => {
    const a = file("A", ["2026-2027", "26 10 October"]);
    const b = file("B", ["2026-2027", "26 09 September"]);
    expect(groupByPath([a, b], 2).map((g) => g.label)).toEqual(["2026-2027/26 10 October", "2026-2027/26 09 September"]);
    expect(groupByPath([a, b], 1)).toHaveLength(1);
  });
});

describe("groupByYear", () => {
  it("sorts years descending and puts Undated last", () => {
    const files = [file("x"), file("Deck 2024-10-30"), file("Deck 2026-01-05"), file("Deck 2025-03-03")];
    const groups = groupByYear(files);
    expect(groups.map((g) => g.year)).toEqual(["2026", "2025", "2024", "Undated"]);
    expect(groups.at(-1)?.year).toBe("Undated");
  });
});

describe("recentFiles", () => {
  it("ignores folders, hidden files, and ok:false results, newest first", () => {
    const folder = file("2026-2027", [], { isFolder: true, modifiedTime: "2030-01-01T00:00:00.000Z" });
    const hidden = file("(OLD) thing", [], { modifiedTime: "2029-01-01T00:00:00.000Z" });
    const a = file("a", [], { modifiedTime: "2026-03-01T00:00:00.000Z" });
    const b = file("b", [], { modifiedTime: "2026-05-01T00:00:00.000Z" });
    const c = file("c", [], { modifiedTime: "2026-04-01T00:00:00.000Z" });
    const result = recentFiles([ok([folder, hidden, a]), failed, ok([b, c])], 2);
    expect(result).toEqual([b, c]);
    expect(result.some((f) => f.isFolder)).toBe(false);
  });

  it("sorts files with an unparseable modifiedTime last, whatever the input order", () => {
    const bad = file("bad", [], { modifiedTime: "" });
    const a = file("a", [], { modifiedTime: "2026-03-01T00:00:00.000Z" });
    const b = file("b", [], { modifiedTime: "2026-05-01T00:00:00.000Z" });
    expect(recentFiles([ok([bad, a, b])], 3)).toEqual([b, a, bad]);
    expect(recentFiles([ok([b, bad, a])], 3)).toEqual([b, a, bad]);
    expect(recentFiles([ok([a, b, bad])], 3)).toEqual([b, a, bad]);
  });
});

describe("visibleFiles and grouping exclusions", () => {
  const folder = () => file("2026-2027", [], { isFolder: true });
  const hidden = (path: string[] = []) => file("(OLD) AVCA 2025 Feb mtg mins", path);

  it("visibleFiles drops folders and hidden files only", () => {
    const a = file("Deck 2026-01-05");
    const b = file("Other", ["2026-2027"]);
    expect(visibleFiles([folder(), a, hidden(), b])).toEqual([a, b]);
  });

  it("groupByYear returns neither folders nor hidden files, and omits empty groups", () => {
    const keep = file("Deck 2026-01-05");
    const groups = groupByYear([folder(), hidden(), keep, { ...hidden(), meetingDate: "2019-01-01" }]);
    expect(groups).toEqual([{ year: "2026", files: [keep] }]);
  });

  it("groupByPath returns neither folders nor hidden files, and omits empty groups", () => {
    const keep = file("Cur", ["2026-2027"]);
    const groups = groupByPath([folder(), hidden(["2025-2026"]), keep, hidden()]);
    expect(groups).toEqual([{ label: "2026-2027", files: [keep] }]);
  });
});

describe("preferPdfTwins", () => {
  const DOC = "application/vnd.google-apps.document";
  const PDF = "application/pdf";
  const names = (files: DriveFile[]) => files.map((f) => f.name);

  it("drops the Google Doc when a PDF in the same folder shares its base name", () => {
    const doc = file("AVCA By-Laws (June 24th, 2026)", [], { mimeType: DOC });
    const pdf = file("AVCA By-Laws (June 24th, 2026).pdf", [], { mimeType: PDF });
    expect(names(preferPdfTwins([doc, pdf]))).toEqual(["AVCA By-Laws (June 24th, 2026).pdf"]);
  });

  it("compares base names case-insensitively", () => {
    const doc = file("avca bylaws", [], { mimeType: DOC });
    const pdf = file("AVCA Bylaws.PDF", [], { mimeType: PDF });
    expect(names(preferPdfTwins([doc, pdf]))).toEqual(["AVCA Bylaws.PDF"]);
  });

  it("keeps a Google Doc whose twin sits in a different folder", () => {
    const doc = file("Amendment", ["Proposed Amendments"], { mimeType: DOC });
    const pdf = file("Amendment.pdf", ["Old Bylaws"], { mimeType: PDF });
    expect(preferPdfTwins([doc, pdf])).toHaveLength(2);
  });

  it("keeps a Google Doc with no PDF twin, and a PDF with no Doc", () => {
    const doc = file("Draft", [], { mimeType: DOC });
    const pdf = file("Other.pdf", [], { mimeType: PDF });
    expect(preferPdfTwins([doc, pdf])).toEqual([doc, pdf]);
  });

  it("only drops Google Docs, never another PDF or file type", () => {
    const a = file("Same", [], { mimeType: "text/plain" });
    const b = file("Same.pdf", [], { mimeType: PDF });
    expect(preferPdfTwins([a, b])).toHaveLength(2);
  });

  it("keeps the order of the remaining files", () => {
    const z = file("Z.pdf", [], { mimeType: PDF });
    const zdoc = file("Z", [], { mimeType: DOC });
    const a = file("A", [], { mimeType: DOC });
    expect(names(preferPdfTwins([z, zdoc, a]))).toEqual(["Z.pdf", "A"]);
  });
});
