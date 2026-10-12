import { describe, expect, it, vi } from "vitest";
import type { DriveFile, FolderResult } from "../src/lib/drive";
import { createSiteDataLoader, lastUpdated, type SiteData } from "../src/lib/data";
import { getSettings } from "../src/lib/settings";

const file = (id: string, modifiedTime: string, extra: Partial<DriveFile> = {}): DriveFile => ({
  id,
  name: `${id}.pdf`,
  mimeType: "application/pdf",
  modifiedTime,
  url: `https://drive.google.com/file/d/${id}/view`,
  isFolder: false,
  path: [],
  ...extra,
});
const ok = (files: DriveFile[]): FolderResult => ({ ok: true, files, folderUrl: "https://example.test/f" });
const down: FolderResult = { ok: false, folderUrl: "https://example.test/f", reason: "offline" };

function folders(over: Partial<SiteData["folders"]> = {}): SiteData["folders"] {
  return { bylaws: down, meetings: down, presentations: down, letters: down, neighborhoodPlan: down, ...over };
}

async function dataWith(f: SiteData["folders"]): Promise<SiteData> {
  return { settings: await getSettings(), now: new Date(), calendar: { ok: false, reason: "x" }, folders: f, rows: [] };
}

describe("lastUpdated", () => {
  it("is undefined when no folder loaded", async () => {
    expect(lastUpdated(await dataWith(folders()))).toBeUndefined();
  });

  it("is the newest modifiedTime across ok folders, ignoring folders and (OLD) files", async () => {
    const data = await dataWith(
      folders({
        bylaws: ok([file("a", "2026-03-01T00:00:00Z")]),
        meetings: ok([
          file("b", "2026-09-01T12:00:00Z"),
          file("c", "2027-01-01T00:00:00Z", { isFolder: true }),
          file("d", "2027-02-01T00:00:00Z", { name: "(OLD) minutes.pdf" }),
        ]),
        letters: down,
      }),
    );
    expect(lastUpdated(data)).toBe("2026-09-01T12:00:00Z");
  });
});

describe("createSiteDataLoader", () => {
  it("invokes the loaders once however many times it is called", async () => {
    const settings = await getSettings();
    const loadCalendar = vi.fn(async () => ({ ok: true as const, meetings: [] }));
    const loadAllFolders = vi.fn(async (_s: unknown, _k?: string) => folders());
    const load = createSiteDataLoader({ getSettings: async () => settings, loadCalendar, loadAllFolders, now: () => new Date("2026-10-12T00:00:00Z"), apiKey: () => "k" });
    const [a, b] = await Promise.all([load(), load()]);
    const c = await load();
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(loadCalendar).toHaveBeenCalledTimes(1);
    expect(loadAllFolders).toHaveBeenCalledTimes(1);
    expect(loadAllFolders.mock.calls[0][1]).toBe("k");
    expect(a.rows).toEqual([]);
  });
});
