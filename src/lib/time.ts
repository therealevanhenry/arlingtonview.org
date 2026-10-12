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

/** e.g. `Wednesday, September 23, 2026` (New York time). */
export function formatMeetingDate(start: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(start);
}

/** e.g. `7:00 to 8:30 pm`; both meridiems when they differ (New York time). */
export function formatMeetingTime(start: Date, end: Date): string {
  const s = clock(start);
  const e = clock(end);
  const startText = s.meridiem === e.meridiem ? s.time : `${s.time} ${s.meridiem}`;
  return `${startText} to ${e.time} ${e.meridiem}`;
}

/** e.g. `Wednesday, September 23, 2026, 7:00 to 8:30 pm` (New York time). */
export function formatMeetingRange(start: Date, end: Date): string {
  return `${formatMeetingDate(start)}, ${formatMeetingTime(start, end)}`;
}

/** e.g. `October 6, 2026` (New York time). */
export function formatCalendarDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "long", day: "numeric" }).format(d);
}
