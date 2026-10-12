import ical, { type VEvent } from "node-ical";
import { CONFERENCING_TOKEN } from "./privacy";
import type { Settings } from "./settings";

export type Meeting = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  /** The event's location with every web link stripped out; absent when no text is left. */
  location?: string;
  /** True when there is no location text, or it holds the whole word virtual, zoom, meet, or online. */
  isVirtual: boolean;
};

export type CalendarResult = { ok: true; meetings: Meeting[] } | { ok: false; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
/** A timed event with no DTEND (or an end not after its start) is shown as a 90-minute meeting, the length of a regular AVCA meeting. */
const DEFAULT_DURATION_MS = 90 * 60 * 1000;
/** A web link with a scheme or a leading `www.`; scheme-less join links are caught by CONFERENCING_TOKEN. */
const URL_TOKEN = /(?:https?:\/\/|www\.)\S+/gi;
const VIRTUAL_WORDS = /\b(?:virtual|zoom|meet|online)\b/i;
/** A location that names no place: one of these terms alone, optionally followed by "meeting". */
const VIRTUAL_ONLY = /^(?:virtual|online|zoom|google meet|meet)(?: meeting)?$/i;

// node-ical returns `string | { val, params }` for text properties.
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "val" in value) return String((value as { val: unknown }).val);
  return "";
}

/** Drops a link but keeps the brackets and sentence punctuation that were wrapped around it. */
const withoutLink = (token: string): string =>
  `${/^[(\[<]+/.exec(token)?.[0] ?? ""} ${/[)\]>.,;:!?]+$/.exec(token)?.[0] ?? ""}`;

/**
 * The location as it may be printed: every web link is stripped out (a join link must never be
 * published, and a map link is noise in a line of text), the punctuation left behind is tidied, and
 * whatever text survives is kept. Undefined when nothing survives.
 */
function locationText(raw: string): string | undefined {
  const tidy = raw
    .replace(URL_TOKEN, withoutLink)
    .replace(CONFERENCING_TOKEN, withoutLink)
    .replace(/\s+/g, " ")
    .replace(/[(\[<][\s.,;:!?-]*[)\]>]/g, " ") // brackets left empty
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:|/–—-]+|[\s,;:|/–—-]+$/g, "");
  return tidy === "" ? undefined : tidy;
}

/**
 * Only the summary, the location, the times, and the status are read. The description is never read:
 * in the live calendar it holds the virtual join link, and nothing in it has been vetted for the site.
 */
function toMeeting(event: VEvent, start: Date, end: Date): Meeting | undefined {
  if (text(event.status).toUpperCase() === "CANCELLED") return undefined;
  const location = locationText(text(event.location));
  const meeting: Meeting = {
    uid: event.uid,
    start: new Date(start.getTime()),
    end: new Date(end.getTime() > start.getTime() ? end.getTime() : start.getTime() + DEFAULT_DURATION_MS),
    title: text(event.summary).trim() || "Meeting",
    isVirtual: location === undefined || VIRTUAL_WORDS.test(location),
  };
  if (location !== undefined) meeting.location = location;
  return meeting;
}

/**
 * The place line for a meeting: `Virtual meeting` when there is no location text or it is only a
 * virtual term ("Virtual", "Online", "Zoom", "Google Meet", "Meet", each optionally followed by
 * "meeting"); otherwise the location as written. A hybrid location such as "Carver Community Center
 * (also on Zoom)" is shown as written, and `isVirtual` is what adds the virtual-link note beside it.
 */
export function placeLabel(meeting: Meeting): string {
  const location = meeting.location?.replace(/\s+/g, " ").trim() ?? "";
  return location === "" || VIRTUAL_ONLY.test(location) ? "Virtual meeting" : location;
}

const isAllDay = (event: VEvent): boolean =>
  event.datetype === "date" || (event.start as { dateOnly?: boolean } | undefined)?.dateOnly === true;

/**
 * Parses an ICS feed into meetings sorted ascending. Recurring series are expanded over
 * [now - 2y, now + 1y] with node-ical's `expandRecurringEvent`, which resolves the series in its own
 * TZID (so 7 pm stays 7 pm across DST) and applies EXDATE and RECURRENCE-ID overrides. Cancelled
 * events and instances are dropped, as are all-day events (not meetings). Standalone events get the
 * same window as recurring ones, judged by their start.
 */
export function parseIcs(body: string, now: Date): Meeting[] {
  const from = new Date(now.getTime() - 2 * 365 * DAY_MS);
  const to = new Date(now.getTime() + 365 * DAY_MS);
  const meetings: Meeting[] = [];
  const events = Object.values(ical.sync.parseICS(body)).filter(
    (item): item is VEvent => item?.type === "VEVENT",
  );
  for (const item of events) {
    if (isAllDay(item)) continue;
    if (item.rrule) {
      for (const i of ical.expandRecurringEvent(item, { from, to })) {
        const m = toMeeting(i.event, i.start, i.end);
        if (m) meetings.push(m);
      }
    } else if (item.start instanceof Date && !Number.isNaN(item.start.getTime())) {
      if (item.start < from || item.start > to) continue;
      const m = toMeeting(item, item.start, item.end instanceof Date ? item.end : item.start);
      if (m) meetings.push(m);
    }
  }
  return meetings.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** First meeting that has not ended yet, so a meeting in progress still counts as next. */
export function nextMeeting(meetings: Meeting[], now: Date): Meeting | undefined {
  return meetings.find((m) => m.end > now);
}

export function upcoming(meetings: Meeting[], now: Date, n: number): Meeting[] {
  return meetings.filter((m) => m.end > now).slice(0, n);
}

export function subscribeLinks(calendarId: string): { google: string; ics: string } {
  return {
    google: `https://calendar.google.com/calendar/u/0?cid=${Buffer.from(calendarId).toString("base64url")}`,
    ics: `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`,
  };
}

const gcalStamp = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function addToGoogleCalendarUrl(m: Meeting): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: m.title,
    dates: `${gcalStamp(m.start)}/${gcalStamp(m.end)}`,
  });
  if (m.location) params.set("location", m.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Never throws. The response body is parsed but never logged or echoed in `reason`. */
export async function loadCalendar(
  settings: Settings,
  now: Date,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<CalendarResult> {
  try {
    if (process.env.OFFLINE === "1") return { ok: false, reason: "OFFLINE=1" };
    const calendarId = settings.calendarId.trim();
    if (calendarId === "") return { ok: false, reason: "calendarId is blank" };
    const response = await fetchImpl(subscribeLinks(calendarId).ics, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.status !== 200) return { ok: false, reason: `HTTP ${response.status}` };
    const body = await response.text();
    if (!body.includes("BEGIN:VCALENDAR")) return { ok: false, reason: "response is not an ICS calendar" };
    return { ok: true, meetings: parseIcs(body, now) };
  } catch (error) {
    const kind = error instanceof Error ? error.name : "unknown error";
    return { ok: false, reason: `calendar fetch or parse failed (${kind})` };
  }
}
