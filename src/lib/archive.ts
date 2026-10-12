import type { Meeting } from "./calendar";
import type { DriveFile, FolderResult } from "./drive";
import { localDate } from "./time";

export type FileKind = "agenda" | "minutes" | "material";

export type ArchiveRow = {
  /** `YYYY-MM-DD` in America/New_York; `YYYY-MM-01` when `approximate`. */
  date: string;
  approximate: boolean;
  meeting?: Meeting;
  agenda?: DriveFile;
  minutes?: DriveFile;
  minutesDraft: boolean;
  materials: DriveFile[];
};

/** How a file's date was found. Lower sorts first: exact, month-only in the name, month of the folder. */
type DateTier = 0 | 1 | 2;

type Candidate = {
  file: DriveFile;
  kind: FileKind;
  draft: boolean;
  date?: string;
  tier: DateTier;
};

type WorkingRow = {
  date: string;
  approximate: boolean;
  meeting?: Meeting;
  agendas: Candidate[];
  minutes: Candidate[];
  materials: Candidate[];
};

const HIDDEN = /^\s*\(old\)/i;
const DRAFT = /\(draft\)/i;
const AGENDA = /\bagendas?\b/i;
const MINUTES = /\b(?:minutes|mins)\b/i;
const MONTH_FOLDER = /^(\d{2}) (\d{2})(?:\s|$)/;

export function classify(file: DriveFile): { kind: FileKind; draft: boolean; hidden: boolean } {
  const { name } = file;
  const kind: FileKind = AGENDA.test(name) ? "agenda" : MINUTES.test(name) ? "minutes" : "material";
  return { kind, draft: DRAFT.test(name), hidden: HIDDEN.test(name) };
}

/** `YYYY-MM` of the nearest ancestor folder named like `26 10 October`. */
export function folderMonth(path: string[]): string | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const m = MONTH_FOLDER.exec(path[i]);
    if (!m) continue;
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return `${2000 + Number(m[1])}-${m[2]}`;
  }
  return undefined;
}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function describeFile(file: DriveFile, inMeetingsTree: boolean): Candidate | undefined {
  if (file.isFolder) return undefined;
  const { kind: classified, draft, hidden } = classify(file);
  if (hidden) return undefined;
  const kind = inMeetingsTree ? classified : "material";
  if (file.meetingDate !== undefined) {
    const approximate = file.approximate === true;
    return { file, kind, draft, date: file.meetingDate, tier: approximate ? 1 : 0 };
  }
  // Minutes are never dated by their folder: the folder belongs to the following meeting.
  const month = inMeetingsTree && kind !== "minutes" ? folderMonth(file.path) : undefined;
  if (month !== undefined) return { file, kind, draft, date: `${month}-01`, tier: 2 };
  return { file, kind, draft, tier: 2 };
}

function candidatesFrom(result: FolderResult, inMeetingsTree: boolean): Candidate[] {
  if (!result.ok) return [];
  return result.files.flatMap((f) => describeFile(f, inMeetingsTree) ?? []);
}

const byIdentity = (a: Candidate, b: Candidate): number =>
  compareText(a.file.name, b.file.name) || compareText(a.file.id, b.file.id);

function newRow(date: string, approximate: boolean): WorkingRow {
  return { date, approximate, agendas: [], minutes: [], materials: [] };
}

function rowsFromMeetings(meetings: Meeting[]): Map<string, WorkingRow> {
  const rows = new Map<string, WorkingRow>();
  const ordered = [...meetings].sort((a, b) => a.start.getTime() - b.start.getTime() || compareText(a.uid, b.uid));
  for (const meeting of ordered) {
    const date = localDate(meeting.start);
    const row = rows.get(date) ?? newRow(date, false);
    // Two meetings on one local date share a row; the ordering above makes the earliest the one kept.
    row.meeting ??= meeting;
    rows.set(date, row);
  }
  return rows;
}

const fillsSlot = (c: Candidate): boolean => c.kind !== "material";

/** Rows for every exact-dated agenda or minutes file, then approximate rows for months that have none. */
function addFileRows(rows: Map<string, WorkingRow>, candidates: Candidate[]): void {
  for (const c of candidates) {
    if (c.date !== undefined && c.tier === 0 && fillsSlot(c) && !rows.has(c.date)) rows.set(c.date, newRow(c.date, false));
  }
  const monthsWithRows = new Set([...rows.keys()].map((d) => d.slice(0, 7)));
  for (const c of candidates) {
    if (c.date === undefined || c.tier === 0 || !fillsSlot(c)) continue;
    const month = c.date.slice(0, 7);
    if (monthsWithRows.has(month)) continue;
    monthsWithRows.add(month);
    rows.set(c.date, newRow(c.date, true));
  }
}

function rowsByMonth(rows: Map<string, WorkingRow>): Map<string, WorkingRow[]> {
  const byMonth = new Map<string, WorkingRow[]>();
  for (const row of rows.values()) {
    const month = row.date.slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), row]);
  }
  return byMonth;
}

/** Exact date with a row wins; otherwise the only row in the file's month; otherwise nothing. */
function targetRow(c: Candidate, rows: Map<string, WorkingRow>, byMonth: Map<string, WorkingRow[]>): WorkingRow | undefined {
  if (c.date === undefined) return undefined;
  if (c.tier === 0) {
    const exact = rows.get(c.date);
    if (exact) return exact;
  }
  const inMonth = byMonth.get(c.date.slice(0, 7));
  return inMonth?.length === 1 ? inMonth[0] : undefined;
}

function attach(rows: Map<string, WorkingRow>, candidates: Candidate[]): void {
  const byMonth = rowsByMonth(rows);
  for (const c of candidates) {
    const row = targetRow(c, rows, byMonth);
    if (!row) continue;
    (c.kind === "agenda" ? row.agendas : c.kind === "minutes" ? row.minutes : row.materials).push(c);
  }
}

/** `modifiedTime` as epoch milliseconds; a missing or unparseable value counts as oldest (0), never NaN. */
const modifiedMs = (f: DriveFile): number => Date.parse(f.modifiedTime) || 0;

/** Non-draft first, then newest `modifiedTime`, then id. */
function preferred(a: Candidate, b: Candidate): number {
  return Number(a.draft) - Number(b.draft) || modifiedMs(b.file) - modifiedMs(a.file) || compareText(a.file.id, b.file.id);
}

function byDate(a: Candidate, b: Candidate): number {
  return a.tier - b.tier || compareText(a.date ?? "", b.date ?? "") || byIdentity(a, b);
}

/** Pick the slot winner; the rest become materials. */
function settle(slot: Candidate[]): { winner?: Candidate; losers: Candidate[] } {
  const [winner, ...losers] = [...slot].sort(preferred);
  return { winner, losers };
}

function finish(row: WorkingRow): ArchiveRow {
  const agenda = settle(row.agendas);
  const minutes = settle(row.minutes);
  const materials = [...row.materials, ...agenda.losers, ...minutes.losers].sort(byDate).map((c) => c.file);
  return {
    date: row.date,
    approximate: row.approximate,
    ...(row.meeting ? { meeting: row.meeting } : {}),
    ...(agenda.winner ? { agenda: agenda.winner.file } : {}),
    ...(minutes.winner ? { minutes: minutes.winner.file } : {}),
    minutesDraft: minutes.winner?.draft ?? false,
    materials,
  };
}

/**
 * Past-meetings rows, newest first, for ALL meetings (callers filter with `pastRows`).
 * Output does not depend on the order of the inputs.
 */
export function buildArchive(
  meetings: Meeting[],
  folders: { meetings: FolderResult; presentations: FolderResult },
): ArchiveRow[] {
  const candidates = [...candidatesFrom(folders.meetings, true), ...candidatesFrom(folders.presentations, false)].sort(byIdentity);
  const rows = rowsFromMeetings(meetings);
  addFileRows(rows, candidates);
  attach(rows, candidates);
  return [...rows.values()].map(finish).sort((a, b) => compareText(b.date, a.date));
}

/** Rows before today (New York), plus today's row once its meeting has ended. */
export function pastRows(rows: ArchiveRow[], now: Date): ArchiveRow[] {
  const today = localDate(now);
  return rows.filter((r) => r.date < today || (r.date === today && (r.meeting === undefined || r.meeting.end <= now)));
}

/** The Drive agenda for the meeting's date, else the link from the calendar description. */
export function agendaFor(meeting: Meeting, rows: ArchiveRow[]): string | undefined {
  const date = localDate(meeting.start);
  return rows.find((r) => r.date === date)?.agenda?.url ?? meeting.agendaUrl;
}

/** The one definition of "visible": not a folder entry and not an `(OLD)` file. */
export function visibleFiles(files: DriveFile[]): DriveFile[] {
  return files.filter((f) => !f.isFolder && !HIDDEN.test(f.name));
}

export function recentFiles(folders: FolderResult[], n: number): DriveFile[] {
  return visibleFiles(folders.flatMap((f) => (f.ok ? f.files : [])))
    .sort((a, b) => modifiedMs(b) - modifiedMs(a) || compareText(a.id, b.id))
    .slice(0, n);
}

const newestFirst = (a: DriveFile, b: DriveFile): number =>
  compareText(b.meetingDate ?? "", a.meetingDate ?? "") || compareText(a.name, b.name) || compareText(a.id, b.id);

export function groupByYear(files: DriveFile[]): Array<{ year: string; files: DriveFile[] }> {
  const groups = new Map<string, DriveFile[]>();
  for (const f of visibleFiles(files)) {
    const year = f.meetingDate?.slice(0, 4) ?? "Undated";
    groups.set(year, [...(groups.get(year) ?? []), f]);
  }
  const rank = (year: string) => (year === "Undated" ? 1 : 0);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || compareText(b, a))
    .map(([year, group]) => ({ year, files: group.sort(newestFirst) }));
}

/** Groups by the first `depth` path segments; top-level files (label "") first, then labels descending. */
export function groupByPath(files: DriveFile[], depth = 1): Array<{ label: string; files: DriveFile[] }> {
  const groups = new Map<string, DriveFile[]>();
  for (const f of visibleFiles(files)) {
    const label = f.path.slice(0, depth).join("/");
    groups.set(label, [...(groups.get(label) ?? []), f]);
  }
  const rank = (label: string) => (label === "" ? 0 : 1);
  return [...groups]
    .sort(([a], [b]) => rank(a) - rank(b) || compareText(b, a))
    .map(([label, group]) => ({ label, files: group.sort(newestFirst) }));
}
