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
const FIELDS = "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)";
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;
const MAX_PAGES = 50;
const ROOTS: DriveRoot[] = ["bylaws", "meetings", "presentations", "letters", "neighborhoodPlan"];

type Raw = { id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string };
type Fail = { ok: false; reason: string };
type Listing = { ok: true; raw: Raw[] } | Fail;

const folderUrlFor = (id: string): string => `https://drive.google.com/drive/folders/${id.trim()}`;

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
    q: `'${folderId}' in parents and trashed=false`,
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
    try {
      const body: unknown = await response.json();
      const { files, nextPageToken } = body as { files?: unknown; nextPageToken?: unknown };
      if (!Array.isArray(files) || !files.every(isRaw)) return { ok: false, reason: "invalid response" };
      return { ok: true, raw: files, next: typeof nextPageToken === "string" ? nextPageToken : undefined };
    } catch {
      return { ok: false, reason: "invalid response" };
    }
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
  return { ok: false, reason: "invalid response" };
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

/** meetingDate descending (undated last), then modifiedTime descending. */
function compareFiles(a: DriveFile, b: DriveFile): number {
  if (a.meetingDate !== b.meetingDate) {
    if (a.meetingDate === undefined) return 1;
    if (b.meetingDate === undefined) return -1;
    return a.meetingDate < b.meetingDate ? 1 : -1;
  }
  return a.modifiedTime === b.modifiedTime ? 0 : a.modifiedTime < b.modifiedTime ? 1 : -1;
}

/** Shared preflight and failure policy: one warning per failed root, never the key. */
async function guarded(
  folderId: string,
  apiKey: string | undefined,
  run: (id: string, key: string) => Promise<{ ok: true; files: DriveFile[] } | Fail>,
): Promise<FolderResult> {
  const folderUrl = folderUrlFor(folderId);
  const fail = (reason: string, warnAbout = true): FolderResult => {
    if (warnAbout) console.warn(`[drive] folder "${folderId.trim()}" not listed: ${reason}; falling back to a link`);
    return { ok: false, folderUrl, reason };
  };
  try {
    if (process.env.OFFLINE === "1") return fail("offline", false);
    if (folderId.trim() === "") return fail("no folder ID");
    if (apiKey === undefined || apiKey === "") return fail("no API key");
    const listing = await run(folderId.trim(), apiKey);
    if (!listing.ok) return fail(listing.reason);
    return { ok: true, files: listing.files, folderUrl };
  } catch {
    return fail("unexpected error");
  }
}

/** Lists one folder (all pages). Never throws; warns once on failure. */
export function listFolder(
  folderId: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<FolderResult> {
  return guarded(folderId, apiKey, async (id, key) => {
    const listing = await listRaw(id, key, fetchImpl, timeoutMs);
    if (!listing.ok) return listing;
    return { ok: true, files: listing.raw.map((r) => toFile(r, [])).sort(compareFiles) };
  });
}

/** Runs `task` over `items` with at most `limit` in flight; stops starting new work after a failure. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
  isFailure: (result: R) => boolean,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const result = await task(items[next++]);
      results.push(result);
      if (isFailure(result)) failed = true;
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Lists a folder and its subfolders breadth-first into one flat array. `maxDepth` is the number of
 * subfolder levels descended below the root; deeper folders appear as `isFolder` entries only.
 * All-or-nothing: any failed request fails the root.
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
          const file = toFile(raw, node.path);
          files.push(file);
          if (file.isFolder) nextLevel.push({ id: file.id, path: [...node.path, file.name] });
        }
      }
      level = nextLevel;
    }
    return { ok: true, files: files.sort(compareFiles) };
  });
}

/** The five published roots as `listTree` results, in parallel. `history` is link-only. */
export async function loadAllFolders(
  settings: Settings,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<DriveRoot, FolderResult>> {
  const results = await Promise.all(ROOTS.map((k) => listTree(settings.drive[k], apiKey, fetchImpl)));
  return Object.fromEntries(ROOTS.map((k, i) => [k, results[i]])) as Record<DriveRoot, FolderResult>;
}
