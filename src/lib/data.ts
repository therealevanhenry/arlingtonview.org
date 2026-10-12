import { buildArchive, currentBylaws, visibleFiles, type ArchiveRow } from "./archive";
import { loadCalendar, type CalendarResult } from "./calendar";
import { DRIVE_ROOTS, loadAllFolders, type DriveRoot, type FolderResult } from "./drive";
import { privateNameReason } from "./privacy";
import { getSettings, type Settings } from "./settings";
import { nowInNewYork } from "./time";

export type SiteData = {
  settings: Settings;
  now: Date;
  calendar: Awaited<ReturnType<typeof loadCalendar>>;
  folders: Awaited<ReturnType<typeof loadAllFolders>>;
  /** `buildArchive` over every calendar meeting (none when the calendar failed), computed once. */
  rows: ArchiveRow[];
  /** The file behind "Current bylaws (PDF)" (`currentBylaws` in archive.ts); undefined when the ID is blank. */
  currentBylaws: { id: string; url: string } | undefined;
};

export type SiteDataDeps = {
  getSettings: typeof getSettings;
  loadCalendar: typeof loadCalendar;
  loadAllFolders: typeof loadAllFolders;
  now: () => Date;
  apiKey: () => string | undefined;
};

const defaultDeps: SiteDataDeps = {
  getSettings,
  loadCalendar,
  loadAllFolders,
  now: nowInNewYork,
  apiKey: () => process.env.GOOGLE_API_KEY,
};

/**
 * Whether this build may replace a healthy site. `scripts/build-health.sh` reads the one line
 * `healthLine` makes of it, so this is the only place that decides.
 * - degraded: Google was reachable in principle (a key, an ID) and something still did not load.
 * - unconfigured: nothing failed, but the Drive key or an ID is missing, so part of the site is a fallback.
 */
export type Health =
  | { state: "ok"; offline: boolean }
  | { state: "unconfigured"; what: string[] }
  | { state: "degraded"; reasons: string[] };

/** Drive failure reasons that mean "not asked", not "asked and failed" (see `guarded` in drive.ts). */
const NOT_ASKED = new Set(["no API key", "no folder ID", "offline"]);

/** One line, no parentheses or semicolons: the reasons sit inside `(...)`, separated by `; `. */
const safeReason = (reason: string): string =>
  reason.replace(/[^A-Za-z0-9 .,:=_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);

export function buildHealth(
  settings: Settings,
  calendar: CalendarResult,
  folders: Record<DriveRoot, FolderResult>,
  offline: boolean,
): Health {
  const calendarBlank = settings.calendarId.trim() === "";
  const reasons: string[] = [];
  const what: string[] = [];
  let noKey = false;
  for (const root of DRIVE_ROOTS) {
    const folder = folders[root];
    if (folder.ok) continue;
    if (!NOT_ASKED.has(folder.reason)) reasons.push(`drive ${root}: ${safeReason(folder.reason)}`);
    else if (folder.reason === "no API key") noKey = true;
    else if (folder.reason === "no folder ID") what.push(`no folder ID for ${root}`);
  }
  if (!calendar.ok && !calendarBlank && !offline) reasons.push(`calendar: ${safeReason(calendar.reason)}`);
  if (reasons.length > 0) return { state: "degraded", reasons };
  if (offline) return { state: "ok", offline: true };
  if (noKey) what.unshift("no API key");
  if (calendarBlank) what.push("calendarId is blank");
  return what.length > 0 ? { state: "unconfigured", what } : { state: "ok", offline: false };
}

/** `[site-data] health: ok`, `... ok (offline)`, `... unconfigured (<what>)`, or `... degraded (<reasons>)`. */
export function healthLine(health: Health): string {
  const detail =
    health.state === "degraded"
      ? `degraded (${health.reasons.join("; ")})`
      : health.state === "unconfigured"
        ? `unconfigured (${health.what.join("; ")})`
        : health.offline
          ? "ok (offline)"
          : "ok";
  return `[site-data] health: ${detail}`;
}

/** Visible files per root that listed ok, in `DRIVE_ROOTS` order. A root that did not list has no entry. */
export function driveFileCounts(folders: Record<DriveRoot, FolderResult>): Partial<Record<DriveRoot, number>> {
  const counts: Partial<Record<DriveRoot, number>> = {};
  for (const root of DRIVE_ROOTS) {
    const folder = folders[root];
    if (folder.ok) counts[root] = visibleFiles(folder.files).length;
  }
  return counts;
}

/**
 * The body of `dist/build-meta.json`: only the per-root file counts, which the deploy workflow compares
 * with the live site's copy (`scripts/drive-drop.sh`). No timestamp: the file is part of the build hash
 * and must change only when a count does.
 */
export function buildMetaJson(folders: Record<DriveRoot, FolderResult>): string {
  return `${JSON.stringify({ driveFileCounts: driveFileCounts(folders) })}\n`;
}

/**
 * A Drive file name as it may be printed in the build log: on one line, and with square brackets
 * shown as parentheses, so no file name can pass for one of the log's own `[...]` lines (the health
 * line above all).
 */
const logName = (name: string): string =>
  name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim();

/** A loader that fetches once and hands every caller the same promise. Injectable for tests. */
export function createSiteDataLoader(deps: SiteDataDeps = defaultDeps): () => Promise<SiteData> {
  let memo: Promise<SiteData> | undefined;
  return () => {
    memo ??= (async () => {
      const settings = await deps.getSettings();
      const now = deps.now();
      const [calendar, folders] = await Promise.all([
        deps.loadCalendar(settings, now),
        deps.loadAllFolders(settings, deps.apiKey()),
      ]);
      const offline = process.env.OFFLINE === "1";
      // For people reading the log (the Drive loader prints its own `[drive]` line per failed root). The
      // reason is a fixed short string from the loader, never a response body. Quiet when the calendar
      // was deliberately not fetched.
      if (!calendar.ok && settings.calendarId.trim() !== "" && !offline) {
        console.warn(`[calendar] not loaded: ${calendar.reason}; the meetings list will be empty`);
      }
      // Not failures: a file left out because its name holds an email address or a conferencing link
      // (`visibleFiles` hides it everywhere), and a bylaws file ID that has gone stale.
      for (const root of DRIVE_ROOTS) {
        const folder = folders[root];
        if (!folder.ok) continue;
        for (const file of folder.files) {
          const reason = file.isFolder ? undefined : privateNameReason(file.name);
          if (reason !== undefined) console.warn(`[drive] hidden: "${logName(file.name)}" (${reason})`);
        }
      }
      const bylaws = currentBylaws(settings.drive.bylawsCurrentFileId, folders.bylaws);
      if (bylaws?.note !== undefined) console.warn(`[site-data] note: ${logName(bylaws.note)}`);
      // For scripts/build-health.sh: exactly one line per build, after every loader has finished.
      console.log(healthLine(buildHealth(settings, calendar, folders, offline)));
      const meetings = calendar.ok ? calendar.meetings : [];
      const rows = buildArchive(meetings, { meetings: folders.meetings, presentations: folders.presentations });
      return { settings, now, calendar, folders, rows, currentBylaws: bylaws && { id: bylaws.id, url: bylaws.url } };
    })();
    return memo;
  };
}

/** One fetch set per build process; every page shares it. */
export const loadSiteData = createSiteDataLoader();

/** Newest `modifiedTime` across the visible files of every folder that loaded; undefined when none did. */
export function lastUpdated(data: SiteData): string | undefined {
  let newest: { iso: string; ms: number } | undefined;
  for (const folder of Object.values(data.folders)) {
    if (!folder.ok) continue;
    for (const file of visibleFiles(folder.files)) {
      const ms = Date.parse(file.modifiedTime);
      if (Number.isNaN(ms)) continue;
      if (newest === undefined || ms > newest.ms) newest = { iso: file.modifiedTime, ms };
    }
  }
  return newest?.iso;
}
