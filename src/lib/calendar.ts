import ical, { type VEvent } from "node-ical";
import type { Settings } from "./settings";

export type Meeting = {
  uid: string;
  start: Date;
  end: Date;
  title: string;
  location?: string;
  isVirtual: boolean;
  agendaUrl?: string;
};

export type CalendarResult = { ok: true; meetings: Meeting[] } | { ok: false; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
/** A timed event with no DTEND (or an end not after its start) is shown as a 90-minute meeting, the length of a regular AVCA meeting. */
const DEFAULT_DURATION_MS = 90 * 60 * 1000;
const AGENDA_URL = /https:\/\/(?:docs|drive)\.google\.com[^\s"'<>\\]*/;
const ANY_URL = /https?:\/\//i;
const VIRTUAL_WORDS = /\b(?:virtual|zoom|meet|online)\b/i;

// node-ical returns `string | { val, params }` for text properties.
function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "val" in value) return String((value as { val: unknown }).val);
  return "";
}

/**
 * The description is read only to find an agenda link, then discarded: in the live calendar it holds
 * the virtual join link, which must never be published.
 */
function toMeeting(event: VEvent, start: Date, end: Date): Meeting | undefined {
  if (text(event.status).toUpperCase() === "CANCELLED") return undefined;
  const rawLocation = text(event.location).trim();
  const location = rawLocation === "" || ANY_URL.test(rawLocation) ? undefined : rawLocation;
  const agendaUrl = text(event.description).match(AGENDA_URL)?.[0].replace(/[.,;)]+$/, "");
  const meeting: Meeting = {
    uid: event.uid,
    start: new Date(start.getTime()),
    end: new Date(end.getTime() > start.getTime() ? end.getTime() : start.getTime() + DEFAULT_DURATION_MS),
    title: text(event.summary).trim() || "Meeting",
    isVirtual: location === undefined || VIRTUAL_WORDS.test(location),
  };
  if (location !== undefined) meeting.location = location;
  if (agendaUrl !== undefined) meeting.agendaUrl = agendaUrl;
  return meeting;
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

/** Meetings that have ended, most recent first. */
export function past(meetings: Meeting[], now: Date): Meeting[] {
  return meetings.filter((m) => m.end <= now).reverse();
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
