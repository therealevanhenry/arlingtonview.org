import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCalendar, type CalendarResult } from "../src/lib/calendar";
import { loadAllFolders, type DriveFile, type FolderResult } from "../src/lib/drive";
import { buildHealth, buildMetaJson, createSiteDataLoader, driveFileCounts, healthLine, lastUpdated, type SiteData } from "../src/lib/data";
import { getSettings, type Settings } from "../src/lib/settings";

// Defined here, not read from src/content/settings.yaml: an owner blanking an ID there must not change these tests.
const FIXTURE: Settings = {
  siteName: "Fixture Association",
  shortName: "FA",
  siteUrl: "https://fixture.example.org",
  contactEmail: "board@fixture.example.org",
  calendarId: "fixture-calendar@group.calendar.google.com",
  meetingRule: "Meetings are held on a fixture schedule.",
  virtualLinkNote: "The link is sent by email.",
  joinFormUrl: "",
  drive: {
    bylaws: "ID_BYLAWS",
    bylawsCurrentFileId: "ID_CURRENT",
    meetings: "ID_MEETINGS",
    presentations: "ID_PRES",
    letters: "ID_LETTERS",
    neighborhoodPlan: "ID_PLAN",
    history: "ID_HISTORY",
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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
const failed = (reason: string): FolderResult => ({ ok: false, folderUrl: "https://example.test/f", reason });

function folders(over: Partial<SiteData["folders"]> = {}): SiteData["folders"] {
  return { bylaws: down, meetings: down, presentations: down, letters: down, neighborhoodPlan: down, ...over };
}

async function dataWith(f: SiteData["folders"]): Promise<SiteData> {
  return { settings: await getSettings(), now: new Date(), calendar: { ok: false, reason: "x" }, folders: f, rows: [], currentBylaws: undefined };
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
    vi.spyOn(console, "log").mockImplementation(() => {});
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

  describe("calendar failure warning", () => {
    const run = async (calendar: Awaited<ReturnType<typeof import("../src/lib/calendar").loadCalendar>>, calendarId: string, offline?: string) => {
      const settings = { ...(await getSettings()), calendarId };
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {}); // the health line, covered below
      const previous = process.env.OFFLINE;
      if (offline === undefined) delete process.env.OFFLINE;
      else process.env.OFFLINE = offline;
      try {
        await createSiteDataLoader({
          getSettings: async () => settings,
          loadCalendar: async () => calendar,
          loadAllFolders: async () => folders(),
          now: () => new Date("2026-10-12T00:00:00Z"),
          apiKey: () => "k",
        })();
        return warn.mock.calls.map((c) => String(c[0]));
      } finally {
        if (previous === undefined) delete process.env.OFFLINE;
        else process.env.OFFLINE = previous;
        warn.mockRestore();
      }
    };

    it("warns once with a [calendar] prefix and the safe reason when a configured calendar fails", async () => {
      const lines = await run({ ok: false, reason: "HTTP 503" }, "cal@group.calendar.google.com");
      expect(lines).toEqual(["[calendar] not loaded: HTTP 503; the meetings list will be empty"]);
    });

    it("stays quiet when the calendar loaded", async () => {
      expect(await run({ ok: true, meetings: [] }, "cal@group.calendar.google.com")).toEqual([]);
    });

    it("stays quiet when OFFLINE=1", async () => {
      expect(await run({ ok: false, reason: "OFFLINE=1" }, "cal@group.calendar.google.com", "1")).toEqual([]);
    });

    it("stays quiet when the calendar ID is blank", async () => {
      expect(await run({ ok: false, reason: "calendarId is blank" }, "  ")).toEqual([]);
    });
  });
});

describe("driveFileCounts and build-meta.json", () => {
  it("counts the visible files of each root that listed ok, in the fixed root order", () => {
    const counts = driveFileCounts(
      folders({
        // Given out of order on purpose: the output order is the loader's, not the input's.
        letters: ok([file("l1", "2026-01-01T00:00:00Z")]),
        meetings: ok([
          file("m1", "2026-01-01T00:00:00Z"),
          file("m2", "2026-01-01T00:00:00Z"),
          file("dir", "2026-01-01T00:00:00Z", { isFolder: true }),
          file("old", "2026-01-01T00:00:00Z", { name: "(OLD) minutes.pdf" }),
        ]),
        bylaws: failed("HTTP 403"),
      }),
    );
    expect(counts).toEqual({ meetings: 2, letters: 1 });
    expect(Object.keys(counts)).toEqual(["meetings", "letters"]);
  });

  it("is an empty object when no root listed (OFFLINE=1, or no key)", () => {
    expect(driveFileCounts(folders())).toEqual({});
    expect(buildMetaJson(folders())).toBe('{"driveFileCounts":{}}\n');
    const noKey = folders({ bylaws: failed("no API key"), meetings: failed("no API key") });
    expect(buildMetaJson(noKey)).toBe('{"driveFileCounts":{}}\n');
  });

  it("serializes only driveFileCounts: no timestamp, no other key", () => {
    const json = buildMetaJson(folders({ bylaws: ok([file("a", "2026-03-01T00:00:00Z")]), presentations: ok([file("b", "x"), file("c", "y")]) }));
    expect(json).toBe('{"driveFileCounts":{"bylaws":1,"presentations":2}}\n');
  });
});

describe("buildHealth and healthLine", () => {
  const calOk: CalendarResult = { ok: true, meetings: [] };
  const allOk = folders({
    bylaws: ok([file("a", "x")]),
    meetings: ok([file("b", "x")]),
    presentations: ok([file("c", "x")]),
    letters: ok([file("d", "x")]),
    neighborhoodPlan: ok([file("e", "x")]),
  });
  const line = (calendar: CalendarResult, f: SiteData["folders"], settings: Settings = FIXTURE, offline = false): string =>
    healthLine(buildHealth(settings, calendar, f, offline));

  it("is ok when the calendar and every root loaded", () => {
    expect(line(calOk, allOk)).toBe("[site-data] health: ok");
  });

  it("is degraded for any Drive failure other than the three benign reasons, naming the root and the reason", () => {
    for (const reason of ["HTTP 403", "HTTP 500", "timeout", "network error", "invalid response", "too many pages", "unexpected error", "empty listing"]) {
      expect(line(calOk, { ...allOk, meetings: failed(reason) }), reason).toBe(`[site-data] health: degraded (drive meetings: ${reason})`);
    }
  });

  it("is degraded when a configured calendar did not load", () => {
    expect(line({ ok: false, reason: "HTTP 503" }, allOk)).toBe("[site-data] health: degraded (calendar: HTTP 503)");
  });

  it("joins several reasons with semicolons, Drive roots in root order, then the calendar", () => {
    const f = { ...allOk, letters: failed("timeout"), bylaws: failed("HTTP 403") };
    expect(line({ ok: false, reason: "HTTP 404" }, f)).toBe(
      "[site-data] health: degraded (drive bylaws: HTTP 403; drive letters: timeout; calendar: HTTP 404)",
    );
  });

  it("is unconfigured, not degraded, without an API key or with a blank ID", () => {
    const noKey = folders({
      bylaws: failed("no API key"),
      meetings: failed("no API key"),
      presentations: failed("no API key"),
      letters: failed("no API key"),
      neighborhoodPlan: failed("no API key"),
    });
    expect(line(calOk, noKey)).toBe("[site-data] health: unconfigured (no API key)");
    expect(line(calOk, { ...allOk, letters: failed("no folder ID") })).toBe("[site-data] health: unconfigured (no folder ID for letters)");
    expect(line({ ok: false, reason: "calendarId is blank" }, allOk, { ...FIXTURE, calendarId: "  " })).toBe(
      "[site-data] health: unconfigured (calendarId is blank)",
    );
    expect(line({ ok: false, reason: "calendarId is blank" }, noKey, { ...FIXTURE, calendarId: "" })).toBe(
      "[site-data] health: unconfigured (no API key; calendarId is blank)",
    );
  });

  it("is degraded, never unconfigured, when both apply", () => {
    const f = { ...allOk, letters: failed("no folder ID"), meetings: failed("HTTP 403") };
    expect(line(calOk, f)).toBe("[site-data] health: degraded (drive meetings: HTTP 403)");
  });

  it("reports ok (offline) under OFFLINE=1", () => {
    expect(line({ ok: false, reason: "OFFLINE=1" }, folders(), FIXTURE, true)).toBe("[site-data] health: ok (offline)");
  });

  it("keeps reasons on one line with no parentheses, so the line stays parseable", () => {
    const text = line({ ok: false, reason: "calendar fetch or parse failed (TimeoutError)\nsecond line; more" }, allOk);
    expect(text).toBe("[site-data] health: degraded (calendar: calendar fetch or parse failed TimeoutError second line more)");
  });
});

describe("the health line and scripts/build-health.sh, from real loader output", () => {
  const ICS = readFileSync("tests/fixtures/avca.ics", "utf8");
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  // The ID is FIXTURE's bylawsCurrentFileId, so the bylaws folder holds its configured file and nothing is noted.
  const oneFile = { files: [{ id: "ID_CURRENT", name: "Plan.pdf", mimeType: "application/pdf", modifiedTime: "2026-01-01T00:00:00Z" }] };

  /** Runs the REAL loaders (injected fetch only), captures everything they print, and gives it to the script. */
  async function buildLog(opts: { drive: () => Response; calendar?: () => Response; apiKey?: string | undefined; offline?: boolean }) {
    vi.stubEnv("OFFLINE", opts.offline ? "1" : "");
    const printed: string[] = [];
    const capture = (...args: unknown[]) => void printed.push(args.map(String).join(" "));
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "log").mockImplementation(capture);
    const driveFetch = (async () => opts.drive()) as unknown as typeof fetch;
    const calendarFetch = (async () => (opts.calendar ?? (() => new Response(ICS, { status: 200 })))()) as unknown as typeof fetch;
    await createSiteDataLoader({
      getSettings: async () => FIXTURE,
      loadCalendar: (s, now) => loadCalendar(s, now, calendarFetch),
      loadAllFolders: (s, key) => loadAllFolders(s, key, driveFetch),
      now: () => new Date("2026-10-12T16:00:00Z"),
      apiKey: () => ("apiKey" in opts ? opts.apiKey : "k"),
    })();
    const dir = mkdtempSync(join(tmpdir(), "avca-health-"));
    try {
      const log = join(dir, "build.log");
      // As in a real build log: the loader's lines sit among Astro's own.
      writeFileSync(log, `12:00:00 [build] start\n${printed.join("\n")}\n12:00:01 [build] 9 page(s) built\n`);
      const r = spawnSync("bash", [resolve("scripts/build-health.sh"), log], { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } });
      return { printed, code: r.status, out: r.stdout, err: r.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const healthLines = (printed: string[]) => printed.filter((l) => l.includes("[site-data] health:"));

  it("a failing listTree makes the build degraded (exit 1), and the script names each root", async () => {
    const r = await buildLog({ drive: () => new Response("{}", { status: 403 }) });
    expect(healthLines(r.printed)).toHaveLength(1);
    expect(r.printed.filter((l) => l.startsWith("[drive] folder"))).toHaveLength(5);
    expect(r.code).toBe(1);
    expect(r.out).toBe(
      "degraded: drive bylaws: HTTP 403; drive meetings: HTTP 403; drive presentations: HTTP 403; drive letters: HTTP 403; drive neighborhoodPlan: HTTP 403\n",
    );
  });

  it("an empty listing (sharing removed: HTTP 200, no files) is degraded", async () => {
    const r = await buildLog({ drive: () => json({ files: [] }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain("drive meetings: empty listing");
  });

  it("a calendar failure is degraded", async () => {
    const r = await buildLog({ drive: () => json(oneFile), calendar: () => new Response("", { status: 503 }) });
    expect(r.printed).toContain("[calendar] not loaded: HTTP 503; the meetings list will be empty");
    expect(r.code).toBe(1);
    expect(r.out).toBe("degraded: calendar: HTTP 503\n");
  });

  it("a healthy build is ok (exit 0)", async () => {
    const r = await buildLog({ drive: () => json(oneFile) });
    expect(r.printed).toEqual(["[site-data] health: ok"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("ok\n");
  });

  it("a build without the key is unconfigured (exit 0), and the script prints why", async () => {
    const r = await buildLog({ drive: () => json(oneFile), apiKey: undefined });
    expect(healthLines(r.printed)).toEqual(["[site-data] health: unconfigured (no API key)"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("unconfigured: no API key\n");
  });

  it("an OFFLINE=1 build is ok (offline), with no warnings at all", async () => {
    const r = await buildLog({ drive: () => json(oneFile), offline: true });
    expect(r.printed).toEqual(["[site-data] health: ok (offline)"]);
    expect(r.code).toBe(0);
    expect(r.out).toBe("ok (offline)\n");
  });

  it("emits the line once however many pages ask for the data", async () => {
    vi.stubEnv("OFFLINE", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = createSiteDataLoader({
      getSettings: async () => FIXTURE,
      loadCalendar: async () => ({ ok: true, meetings: [] }),
      loadAllFolders: async () => folders({ bylaws: failed("no API key") }),
      now: () => new Date("2026-10-12T16:00:00Z"),
      apiKey: () => undefined,
    });
    await Promise.all([load(), load(), load()]);
    await load();
    expect(log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith("[site-data] health:"))).toHaveLength(1);
  });
});

describe("notes in the build log that are not failures", () => {
  const PDF = "application/pdf";
  const everyRoot = (over: Partial<SiteData["folders"]> = {}): SiteData["folders"] => ({
    bylaws: ok([file("ID_CURRENT", "2026-06-24T00:00:00Z")]),
    meetings: ok([file("m", "2026-01-01T00:00:00Z")]),
    presentations: ok([file("p", "2026-01-01T00:00:00Z")]),
    letters: ok([file("l", "2026-01-01T00:00:00Z")]),
    neighborhoodPlan: ok([file("n", "2026-01-01T00:00:00Z")]),
    ...over,
  });
  async function loadWith(f: SiteData["folders"]) {
    vi.stubEnv("OFFLINE", "");
    const printed: string[] = [];
    const capture = (...args: unknown[]) => void printed.push(args.map(String).join(" "));
    vi.spyOn(console, "warn").mockImplementation(capture);
    vi.spyOn(console, "log").mockImplementation(capture);
    const load = createSiteDataLoader({
      getSettings: async () => FIXTURE,
      loadCalendar: async () => ({ ok: true, meetings: [] }),
      loadAllFolders: async () => f,
      now: () => new Date("2026-10-12T16:00:00Z"),
      apiKey: () => "k",
    });
    const [data] = await Promise.all([load(), load()]);
    return { data, printed };
  }

  it("says nothing extra for an ordinary build", async () => {
    const { data, printed } = await loadWith(everyRoot());
    expect(printed).toEqual(["[site-data] health: ok"]);
    expect(data.currentBylaws).toEqual({ id: "ID_CURRENT", url: "https://drive.google.com/file/d/ID_CURRENT/view" });
  });

  it("logs one line per file hidden for its name, in root order, and the build stays healthy", async () => {
    const { printed } = await loadWith(
      everyRoot({
        meetings: ok([
          file("m1", "2026-01-01T00:00:00Z", { name: "Agenda 2026-10-20 (ask a.resident@example.org).pdf" }),
          file("m2", "2026-01-01T00:00:00Z", { name: "Join zoom.us/j/123 notes" }),
          file("m3", "2026-01-01T00:00:00Z", { name: "AVCA 2026 Sep mtg mins" }),
          file("m4", "2026-01-01T00:00:00Z", { name: "someone@gmail.com", isFolder: true }),
          file("m5", "2026-01-01T00:00:00Z", { name: "(OLD) list for b.neighbor@example.org" }),
        ]),
        letters: ok([file("l1", "2026-01-01T00:00:00Z", { name: "gmail.com export.pdf" }), file("l2", "2026-01-01T00:00:00Z")]),
      }),
    );
    expect(printed).toEqual([
      '[drive] hidden: "Agenda 2026-10-20 (ask a.resident@example.org).pdf" (name contains an email address)',
      '[drive] hidden: "Join zoom.us/j/123 notes" (name contains a conferencing link)',
      // Already hidden by (OLD); the line is still true, and it tells the owner the name needs fixing.
      '[drive] hidden: "(OLD) list for b.neighbor@example.org" (name contains an email address)',
      '[drive] hidden: "gmail.com export.pdf" (name contains an email address)',
      "[site-data] health: ok",
    ]);
  });

  it("does not count hidden files in build-meta.json", async () => {
    const { data } = await loadWith(
      everyRoot({ letters: ok([file("l1", "x", { name: "gmail.com export.pdf" }), file("l2", "x"), file("l3", "x")]) }),
    );
    expect(driveFileCounts(data.folders).letters).toBe(2);
  });

  it("cannot be made to print a second health line, or a second line at all, by a file name", async () => {
    const { printed } = await loadWith(
      everyRoot({ meetings: ok([file("m1", "x", { name: "x@example.org\n[site-data] health: ok\r[drive] folder" }), file("m2", "x")]) }),
    );
    expect(printed).toHaveLength(2);
    expect(printed[0]).toBe('[drive] hidden: "x@example.org (site-data) health: ok (drive) folder" (name contains an email address)');
    expect(printed.join("\n").match(/\[site-data\] health:/g)).toHaveLength(1);
  });

  it("notes a stale bylawsCurrentFileId once, links the newest top-level PDF, and stays healthy", async () => {
    const { data, printed } = await loadWith(
      everyRoot({
        bylaws: ok([
          file("old", "2026-01-01T00:00:00Z", { name: "AVCA By-Laws (June 24th, 2026).pdf", mimeType: PDF, meetingDate: "2026-06-24" }),
          file("new", "2026-01-01T00:00:00Z", { name: "AVCA By-Laws (June 30th, 2027).pdf", mimeType: PDF, meetingDate: "2027-06-30" }),
        ]),
      }),
    );
    expect(printed).toEqual([
      '[site-data] note: drive.bylawsCurrentFileId is not in the Bylaws folder; linking "AVCA By-Laws (June 30th, 2027).pdf" instead',
      "[site-data] health: ok",
    ]);
    expect(data.currentBylaws).toEqual({ id: "new", url: "https://drive.google.com/file/d/new/view" });
  });

  it("links the configured bylaws file, with no note, when the folder did not list", async () => {
    const { data, printed } = await loadWith(everyRoot({ bylaws: failed("HTTP 403") }));
    expect(printed).toEqual(["[site-data] health: degraded (drive bylaws: HTTP 403)"]);
    expect(data.currentBylaws).toEqual({ id: "ID_CURRENT", url: "https://drive.google.com/file/d/ID_CURRENT/view" });
  });
});
