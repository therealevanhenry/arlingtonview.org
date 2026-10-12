import { buildArchive, visibleFiles, type ArchiveRow } from "./archive";
import { loadCalendar } from "./calendar";
import { loadAllFolders } from "./drive";
import { getSettings, type Settings } from "./settings";
import { nowInNewYork } from "./time";

export type SiteData = {
  settings: Settings;
  now: Date;
  calendar: Awaited<ReturnType<typeof loadCalendar>>;
  folders: Awaited<ReturnType<typeof loadAllFolders>>;
  /** `buildArchive` over every calendar meeting (none when the calendar failed), computed once. */
  rows: ArchiveRow[];
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
      const meetings = calendar.ok ? calendar.meetings : [];
      const rows = buildArchive(meetings, { meetings: folders.meetings, presentations: folders.presentations });
      return { settings, now, calendar, folders, rows };
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
