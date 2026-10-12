import { parseMeetingDate } from "./meetingDate";
import type { Settings } from "./settings";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  url: string;
  meetingDate?: string;
  approximate?: boolean;
  isFolder: boolean;
  /** Names of the ancestor folders below the listed root; `[]` for top level. */
  path: string[];
};

export type FolderResult =
  | { ok: true; files: DriveFile[]; folderUrl: string }
  | { ok: false; folderUrl: string; reason: string };

export type DriveRoot = "bylaws" | "meetings" | "presentations" | "letters" | "neighborhoodPlan";

const API_URL = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
/** A shortcut can point at anything, including files outside the published folders, so it is never listed. */
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const FIELDS = "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)";
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;
const MAX_PAGES = 50;
/** The published roots, in the one order used wherever they are listed (logs, build-meta.json). */
export const DRIVE_ROOTS: readonly DriveRoot[] = ["bylaws", "meetings", "presentations", "letters", "neighborhoodPlan"];

type Raw = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string };
type Fail = { ok: false; reason: string };
type Listing = { ok: true; raw: Raw[] } | Fail;

/** Settings are validated upstream, but no exported loader may throw, so a non-string ID counts as blank. */
const cleanId = (id: unknown): string => (typeof id === "string" ? id.trim() : "");
const folderUrlFor = (id: string): string => `https://drive.google.com/drive/folders/${id}`;
/** Escapes a value for a single-quoted Drive `q` string literal. */
const escapeQ = (value: string): string => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const isRaw = (v: unknown): v is Raw => {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.name === "string" && typeof r.mimeType === "string";
};

/**
 * One request with a single retry on network error, timeout, 5xx, or 429. Reasons are fixed short
 * strings: error messages and URLs are never copied, because both can carry the API key.
 */
async function requestPage(
  folderId: string,
  apiKey: string,
  pageToken: string | undefined,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; raw: Raw[]; next?: string } | Fail> {
  const params = new URLSearchParams({
    q: `'${escapeQ(folderId)}' in parents and trashed=false`,
    fields: FIELDS,
    pageSize: "200",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    key: apiKey,
  });
  if (pageToken !== undefined) params.set("pageToken", pageToken);
  const url = `${API_URL}?${params}`;

  let failure = "network error";
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      failure = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network error";
      continue;
    }
    if (response.status >= 500 || response.status === 429) {
      failure = `HTTP ${response.status}`;
      continue;
    }
    if (response.status !== 200) return { ok: false, reason: `HTTP ${response.status}` };
    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      // A body that never finishes arriving is transient (retry); a body that arrived but does not parse is not.
      if (error instanceof SyntaxError) return { ok: false, reason: "invalid response" };
      const aborted = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      failure = aborted ? "timeout" : "network error";
      continue;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return { ok: false, reason: "invalid response" };
    }
    const { files = [], nextPageToken } = body as { files?: unknown; nextPageToken?: unknown };
    if (!Array.isArray(files) || !files.every(isRaw)) return { ok: false, reason: "invalid response" };
    return { ok: true, raw: files, next: typeof nextPageToken === "string" ? nextPageToken : undefined };
  }
  return { ok: false, reason: failure };
}

async function listRaw(
  folderId: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Listing> {
  const raw: Raw[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await requestPage(folderId, apiKey, pageToken, fetchImpl, timeoutMs);
    if (!result.ok) return result;
    raw.push(...result.raw);
    if (result.next === undefined) return { ok: true, raw };
    pageToken = result.next;
  }
  return { ok: false, reason: "too many pages" };
}

function toFile(raw: Raw, path: string[]): DriveFile {
  const parsed = parseMeetingDate(raw.name);
  const file: DriveFile = {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    modifiedTime: raw.modifiedTime ?? "",
    url: raw.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(raw.id)}`,
    isFolder: raw.mimeType === FOLDER_MIME,
    path,
  };
  if (parsed) {
    file.meetingDate = parsed.date;
    file.approximate = parsed.approximate;
  }
  return file;
}

/**
 * meetingDate descending (undated last), then modifiedTime descending, then name and id ascending.
 * Total, so the output never depends on request completion order.
 */
function compareFiles(a: DriveFile, b: DriveFile): number {
  if (a.meetingDate !== b.meetingDate) {
    if (a.meetingDate === undefined) return 1;
    if (b.meetingDate === undefined) return -1;
    return a.meetingDate < b.meetingDate ? 1 : -1;
  }
  if (a.modifiedTime !== b.modifiedTime) return a.modifiedTime < b.modifiedTime ? 1 : -1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
}

/** Shared preflight and failure policy: one warning per failed root, never the key. */
async function guarded(
  folderId: string,
  apiKey: string | undefined,
  run: (id: string, key: string) => Promise<{ ok: true; files: DriveFile[] } | Fail>,
): Promise<FolderResult> {
  const id = cleanId(folderId);
  const folderUrl = folderUrlFor(id);
  const fail = (reason: string, warnAbout = true): FolderResult => {
    if (warnAbout) console.warn(`[drive] folder "${id}" not listed: ${reason}; falling back to a link`);
    return { ok: false, folderUrl, reason };
  };
  try {
    if (process.env.OFFLINE === "1") return fail("offline", false);
    if (id === "") return fail("no folder ID");
    if (apiKey === undefined || apiKey === "") return fail("no API key");
    const listing = await run(id, apiKey);
    if (!listing.ok) return fail(listing.reason);
    return { ok: true, files: listing.files, folderUrl };
  } catch {
    return fail("unexpected error");
  }
}

/**
 * Runs `task` over `items` with at most `limit` in flight; stops starting new work after a failure.
 * Results are in item order (items never started are omitted), not completion order.
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
  isFailure: (result: R) => boolean,
): Promise<R[]> {
  const results: Array<R | undefined> = new Array(items.length).fill(undefined);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      const result = await task(items[index]);
      results[index] = result;
      if (isFailure(result)) failed = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  // Workers claim items in order, so the started items form a prefix and the filter keeps item order.
  return results.filter((r): r is R => r !== undefined);
}

/**
 * Lists a folder and its subfolders breadth-first into one flat array. `maxDepth` is the number of
 * subfolder levels descended below the root; deeper folders appear as `isFolder` entries only.
 * All-or-nothing: any failed request fails the root, reported as the first failure in listing order.
 * Never throws; warns once on failure.
 *
 * A tree with no files at all fails with "empty listing". `files.list` answers HTTP 200 with fewer or no
 * files when link sharing is removed from a folder, and every published root holds files, so an empty
 * root is far more likely a sharing change than a fact. Shortcuts are skipped and do not count.
 */
export function listTree(
  folderId: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
  maxDepth = 3,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<FolderResult> {
  return guarded(folderId, apiKey, async (rootId, key) => {
    const files: DriveFile[] = [];
    let level: Array<{ id: string; path: string[] }> = [{ id: rootId, path: [] }];
    for (let depth = 0; depth <= maxDepth && level.length > 0; depth++) {
      const listings = await mapLimit(
        level,
        CONCURRENCY,
        async (node) => ({ node, listing: await listRaw(node.id, key, fetchImpl, timeoutMs) }),
        (r) => !r.listing.ok,
      );
      const bad = listings.find((l) => !l.listing.ok);
      if (bad && !bad.listing.ok) return bad.listing;
      const nextLevel: typeof level = [];
      for (const { node, listing } of listings) {
        if (!listing.ok) continue;
        for (const raw of listing.raw) {
          if (raw.mimeType === SHORTCUT_MIME) continue;
          const file = toFile(raw, node.path);
          files.push(file);
          if (file.isFolder) nextLevel.push({ id: file.id, path: [...node.path, file.name] });
        }
      }
      level = nextLevel;
    }
    if (!files.some((f) => !f.isFolder)) return { ok: false, reason: "empty listing" };
    return { ok: true, files: files.sort(compareFiles) };
  });
}

/** The five published roots as `listTree` results, in parallel. `history` is link-only. */
export async function loadAllFolders(
  settings: Settings,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<DriveRoot, FolderResult>> {
  const results = await Promise.all(DRIVE_ROOTS.map((k) => listTree(settings.drive[k], apiKey, fetchImpl)));
  return Object.fromEntries(DRIVE_ROOTS.map((k, i) => [k, results[i]])) as Record<DriveRoot, FolderResult>;
}
