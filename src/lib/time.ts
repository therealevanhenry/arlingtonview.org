import type { DriveFile } from "./drive";

const TIME_ZONE = "America/New_York";

/** The only clock read in the calendar code. Everything else takes `now` as a parameter. */
export function nowInNewYork(): Date {
  return new Date();
}

function parts(d: Date, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, ...options }).formatToParts(d);
  return Object.fromEntries(formatted.map((p) => [p.type, p.value]));
}

/** `YYYY-MM-DD` calendar date in America/New_York. */
export function localDate(d: Date): string {
  const p = parts(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

function clock(d: Date): { time: string; meridiem: string } {
  const p = parts(d, { hour: "numeric", minute: "2-digit", hour12: true });
  return { time: `${p.hour}:${p.minute}`, meridiem: (p.dayPeriod ?? "").toLowerCase() };
}

/** e.g. `Wednesday` (New York time). The first line of the home page date lockup. */
export function formatMeetingWeekday(start: Date): string {
  return parts(start, { weekday: "long" }).weekday;
}

/** e.g. `September 23` (New York time). The second line of the home page date lockup. */
export function formatMeetingMonthDay(start: Date): string {
  const p = parts(start, { month: "long", day: "numeric" });
  return `${p.month} ${p.day}`;
}

/** e.g. `Wednesday, September 23, 2026` (New York time): the weekday, the month and day, and the year. */
export function formatMeetingDate(start: Date): string {
  const { year } = parts(start, { year: "numeric" });
  return `${formatMeetingWeekday(start)}, ${formatMeetingMonthDay(start)}, ${year}`;
}

/** e.g. `7:00 to 8:30 pm`; both meridiems when they differ (New York time). */
export function formatMeetingTime(start: Date, end: Date): string {
  const s = clock(start);
  const e = clock(end);
  const startText = s.meridiem === e.meridiem ? s.time : `${s.time} ${s.meridiem}`;
  return `${startText} to ${e.time} ${e.meridiem}`;
}

/**
 * e.g. `Wednesday, September 23, 2026, 7:00 to 8:30 pm` (New York time). A range that crosses local
 * midnight names both days: `Tuesday, September 29, 2026, 7:00 pm to Wednesday, September 30, 2026, 1:00 am`.
 */
export function formatMeetingRange(start: Date, end: Date): string {
  if (localDate(start) !== localDate(end)) {
    const s = clock(start);
    const e = clock(end);
    return `${formatMeetingDate(start)}, ${s.time} ${s.meridiem} to ${formatMeetingDate(end)}, ${e.time} ${e.meridiem}`;
  }
  return `${formatMeetingDate(start)}, ${formatMeetingTime(start, end)}`;
}

/** e.g. `October 6, 2026` (New York time). */
export function formatCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "long", day: "numeric" }).format(d);
}

/** A parsed archive date: `June 24, 2026`, or `June 2026` when only the month is known. */
export function formatArchiveDate(date: string, approximate = false): string {
  const [y, m, d] = date.split("-").map(Number);
  // Noon UTC is the same calendar day in New York all year.
  const instant = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "long",
    ...(approximate ? {} : { day: "numeric" as const }),
  }).format(instant);
}

/** `document`: the date parsed from the file's name; `modified`: the Drive modified time, a fallback. */
export type FileDate = { text: string; datetime: string; kind: "document" | "modified" };

/** The New York modified date of a file; undefined when `modifiedTime` does not parse (never throws). */
export function formatModifiedDate(file: DriveFile): FileDate | undefined {
  const ms = Date.parse(file.modifiedTime);
  if (Number.isNaN(ms)) return undefined;
  return { text: formatCalendarDate(new Date(ms)), datetime: file.modifiedTime, kind: "modified" };
}

/**
 * The date shown beside a file: the parsed meeting date (`<time>` value `YYYY-MM-DD`, or `YYYY-MM` when only
 * the month is known), else the modified date. Undefined when neither is usable, so callers omit the date.
 */
export function formatFileDate(file: DriveFile): FileDate | undefined {
  if (file.meetingDate !== undefined) {
    const approximate = file.approximate === true;
    return {
      text: formatArchiveDate(file.meetingDate, approximate),
      datetime: approximate ? file.meetingDate.slice(0, 7) : file.meetingDate,
      kind: "document",
    };
  }
  return formatModifiedDate(file);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/** `2026-09` as `September 2026`. Takes the board schema's `YYYY-MM` form, which is already validated. */
export function formatTermMonth(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTH_NAMES[Number(number) - 1]} ${year}`;
}
