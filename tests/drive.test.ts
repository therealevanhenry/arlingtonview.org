import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import minutesFixture from "./fixtures/drive-minutes.json";
import { listTree, loadAllFolders } from "../src/lib/drive";
import type { Settings } from "../src/lib/settings";

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";
const KEY = "SECRET-KEY-do-not-leak";
const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;

type Raw = { id: string; name: string; mimeType: string; modifiedTime: string; webViewLink: string };
const entry = (id: string, name: string, mimeType = DOC, modifiedTime = "2026-01-01T00:00:00.000Z"): Raw => ({
  id,
  name,
  mimeType,
  modifiedTime,
  webViewLink: `https://example.test/view/${id}`,
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const parentOf = (input: RequestInfo | URL) => new URL(String(input)).searchParams.get("q")!.match(/^'([^']*)' in parents/)![1];
const mockFetch = (body: unknown) => (async () => json(body)) as unknown as typeof fetch;

// Mirrors the real shape: root -> year folders -> month folders -> Google Docs.
const TREE: Record<string, Raw[]> = {
  ROOT: [
    entry("Y2627", "2026-2027", FOLDER, "2026-10-01T00:00:00.000Z"),
    entry("Y2526", "2025-2026", FOLDER, "2026-06-01T00:00:00.000Z"),
    entry("TOP", "Motion of Neutrality on S Pierce Street", DOC, "2025-03-04T10:00:00.000Z"),
  ],
  Y2627: [entry("M10", "26 10 October", FOLDER)],
  M10: [
    entry("A1", "AVCA Monthly Meeting Proposed Agenda - October 20, 2026", DOC, "2026-10-10T00:00:00.000Z"),
    entry("M1", "AVCA 2026 Sep mtg mins (draft)", DOC, "2026-10-11T00:00:00.000Z"),
  ],
  Y2526: [entry("A2", "AVCA Proposed Agenda 06.24.2026", DOC, "2026-06-20T00:00:00.000Z")],
};
const treeFetch = (tree = TREE, log: string[] = []) =>
  (async (input: RequestInfo | URL) => {
    const id = parentOf(input);
    log.push(id);
    return json({ files: tree[id] ?? [] });
  }) as unknown as typeof fetch;

let warn: ReturnType<typeof vi.spyOn>;
let savedOffline: string | undefined;
beforeEach(() => {
  savedOffline = process.env.OFFLINE;
  delete process.env.OFFLINE;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  if (savedOffline === undefined) delete process.env.OFFLINE;
  else process.env.OFFLINE = savedOffline;
  vi.restoreAllMocks();
});

// One folder with no subfolders: a single request per page, so these cover the request, retry, and failure policy.
describe("listTree: one folder (requests, retries, failures)", () => {
  it("maps files and parses dates", async () => {
    const r = await listTree("F1", "k", mockFetch(minutesFixture));
    expect(r.ok && r.files[0].meetingDate).toBe("2026-06-24");
    if (!r.ok) throw new Error("expected ok");
    expect(r.folderUrl).toBe(folderUrl("F1"));
    expect(r.files.map((f) => f.name)).toEqual([
      "AVCA Proposed Agenda 06.24.2026",
      "AVCA 2026 June mtg mins",
      "AVCA Meeting Minutes 9.25.24",
      "Motion of Neutrality on S Pierce Street",
    ]);
    expect(r.files[0]).toMatchObject({
      id: "FAKE_ID_02",
      url: "https://docs.google.com/document/d/FAKE_ID_02/edit",
      isFolder: false,
      approximate: false,
      path: [],
    });
    expect(r.files[1]).toMatchObject({ meetingDate: "2026-06-01", approximate: true });
    expect(r.files[3].meetingDate).toBeUndefined();
  });

  it("sorts by meetingDate then modifiedTime, undated last", async () => {
    const body = {
      files: [
        entry("a", "Undated old", DOC, "2020-01-01T00:00:00Z"),
        entry("b", "Undated new", DOC, "2025-01-01T00:00:00Z"),
        entry("c", "AVCA Agenda 2024-01-01", DOC, "2024-01-01T00:00:00Z"),
        entry("d", "AVCA Agenda 2024-01-01 v2", DOC, "2024-02-01T00:00:00Z"),
      ],
    };
    const r = await listTree("F1", "k", mockFetch(body));
    expect(r.ok && r.files.map((f) => f.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("follows pagination, passing pageToken and requesting nextPageToken", async () => {
    const urls: URL[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url);
      return url.searchParams.get("pageToken") === "T2"
        ? json({ files: [entry("p2", "Two")] })
        : json({ files: [entry("p1", "One")], nextPageToken: "T2" });
    }) as unknown as typeof fetch;
    const r = await listTree("F1", "k", fetchImpl);
    expect(r.ok && r.files.length).toBe(2);
    expect(urls).toHaveLength(2);
    expect(urls[0].searchParams.has("pageToken")).toBe(false);
    expect(urls[0].searchParams.get("fields")).toBe(
      "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
    );
    expect(urls[1].searchParams.get("pageToken")).toBe("T2");
  });

  it("builds the spec request", async () => {
    const urls: URL[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input)));
      return json({ files: [entry("a", "A")] });
    }) as unknown as typeof fetch;
    await listTree("F 1&x", "k", fetchImpl);
    const u = urls[0];
    expect(u.origin + u.pathname).toBe("https://www.googleapis.com/drive/v3/files");
    expect(u.searchParams.get("q")).toBe("'F 1&x' in parents and trashed=false");
    expect(u.searchParams.get("pageSize")).toBe("200");
    expect(u.searchParams.get("supportsAllDrives")).toBe("true");
    expect(u.searchParams.get("includeItemsFromAllDrives")).toBe("true");
    expect(u.searchParams.get("key")).toBe("k");
  });

  it("returns ok:false with folderUrl on 403 and does not retry", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 }));
    const r = await listTree("F1", "k", fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: false, folderUrl: folderUrl("F1"), reason: "HTTP 403" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("F1");
  });

  it("returns ok:false when apiKey is undefined without calling fetch", async () => {
    const spy = vi.fn();
    const r = await listTree("F1", undefined, spy as unknown as typeof fetch);
    expect(spy).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, folderUrl: folderUrl("F1"), reason: "no API key" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false with reason 'no folder ID' for a blank ID, without fetching", async () => {
    const spy = vi.fn();
    const r = await listTree("  ", "k", spy as unknown as typeof fetch);
    expect(spy).not.toHaveBeenCalled();
    expect(!r.ok && r.reason).toBe("no folder ID");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("short-circuits on OFFLINE=1 without fetching", async () => {
    process.env.OFFLINE = "1";
    const spy = vi.fn();
    const r = await listTree("F1", "k", spy as unknown as typeof fetch);
    expect(spy).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, folderUrl: folderUrl("F1"), reason: "offline" });
  });

  it("retries once on a 5xx and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => (++calls === 1 ? new Response("", { status: 503 }) : json({ files: [entry("a", "A")] }))) as unknown as typeof fetch;
    const r = await listTree("F1", "k", fetchImpl);
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("retries once on a network error, then reports 'network error'", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const r = await listTree("F1", "k", fetchImpl as unknown as typeof fetch);
    expect(!r.ok && r.reason).toBe("network error");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries 429 once", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 429 }));
    const r = await listTree("F1", "k", fetchImpl as unknown as typeof fetch);
    expect(!r.ok && r.reason).toBe("HTTP 429");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("times out (injectable) and retries once", async () => {
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        }),
    );
    const r = await listTree("F1", "k", fetchImpl as unknown as typeof fetch, 3, 20);
    expect(!r.ok && r.reason).toBe("timeout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports 'invalid response' for a malformed body", async () => {
    const r = await listTree("F1", "k", mockFetch({ files: "nope" }));
    expect(!r.ok && r.reason).toBe("invalid response");
    const r2 = await listTree("F1", "k", (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch);
    expect(!r2.ok && r2.reason).toBe("invalid response");
  });

  it("treats a missing files property as an empty list (an empty root, see below), but rejects non-array files and non-object bodies", async () => {
    const r = await listTree("F1", "k", mockFetch({}));
    expect(!r.ok && r.reason).toBe("empty listing");
    for (const body of [{ files: {} }, { files: null }, [], "text", 7, null]) {
      const bad = await listTree("F1", "k", mockFetch(body));
      expect(!bad.ok && bad.reason).toBe("invalid response");
    }
  });

  it("reports 'too many pages' when pagination never ends", async () => {
    const fetchImpl = vi.fn(async () => json({ files: [], nextPageToken: "more" }));
    const r = await listTree("F1", "k", fetchImpl as unknown as typeof fetch);
    expect(!r.ok && r.reason).toBe("too many pages");
    expect(fetchImpl).toHaveBeenCalledTimes(50);
  });

  it("classifies a body read that times out as 'timeout' and uses the one retry", async () => {
    const fetchImpl = vi.fn(async () => {
      const stream = new ReadableStream({
        pull(controller) {
          controller.error(new DOMException("timed out", "TimeoutError"));
        },
      });
      return new Response(stream, { status: 200 });
    });
    const r = await listTree("F1", "k", fetchImpl as unknown as typeof fetch);
    expect(!r.ok && r.reason).toBe("timeout");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("classifies a body read that fails otherwise as 'network error' and retries", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      if (++calls === 2) return json({ files: [entry("a", "A")] });
      const stream = new ReadableStream({
        pull(controller) {
          controller.error(new TypeError(`terminated ${KEY}`));
        },
      });
      return new Response(stream, { status: 200 });
    });
    const r = await listTree("F1", KEY, fetchImpl as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });

  it("never throws for a non-string folder ID", async () => {
    const spy = vi.fn();
    for (const id of [undefined, null, 42, {}]) {
      const r = await listTree(id as unknown as string, "k", spy as unknown as typeof fetch);
      expect(r).toEqual({ ok: false, folderUrl: folderUrl(""), reason: "no folder ID" });
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("escapes backslash and single quote in the folder ID inside q", async () => {
    const urls: URL[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      urls.push(new URL(String(input)));
      return json({ files: [entry("a", "A")] });
    }) as unknown as typeof fetch;
    await listTree("a'b\\c", "k", fetchImpl);
    expect(urls[0].searchParams.get("q")).toBe("'a\\'b\\\\c' in parents and trashed=false");
  });

  it("never leaks the API key into reasons or warnings", async () => {
    const cases: Array<typeof fetch> = [
      (async () => {
        throw new TypeError(`fetch failed for key=${KEY}`);
      }) as unknown as typeof fetch,
      (async () => new Response(`bad key ${KEY}`, { status: 500 })) as unknown as typeof fetch,
      (async () => new Response(`bad key ${KEY}`, { status: 400 })) as unknown as typeof fetch,
      (async () => new Response(`${KEY}`, { status: 200 })) as unknown as typeof fetch,
    ];
    for (const fetchImpl of cases) {
      const r = await listTree("F1", KEY, fetchImpl);
      expect(r.ok).toBe(false);
      expect(JSON.stringify(r)).not.toContain(KEY);
    }
    expect(warn).toHaveBeenCalledTimes(cases.length);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(KEY);
  });
});

describe("listTree", () => {
  it("returns files with paths, folders as isFolder entries, sorted", async () => {
    const log: string[] = [];
    const r = await listTree("ROOT", "k", treeFetch(TREE, log));
    if (!r.ok) throw new Error("expected ok");
    expect(r.folderUrl).toBe(folderUrl("ROOT"));
    const byId = Object.fromEntries(r.files.map((f) => [f.id, f]));
    expect(byId.TOP.path).toEqual([]);
    expect(byId.Y2627).toMatchObject({ isFolder: true, path: [] });
    expect(byId.M10).toMatchObject({ isFolder: true, path: ["2026-2027"] });
    expect(byId.A1.path).toEqual(["2026-2027", "26 10 October"]);
    expect(byId.M1.path).toEqual(["2026-2027", "26 10 October"]);
    expect(byId.A2.path).toEqual(["2025-2026"]);
    expect(byId.A1.meetingDate).toBe("2026-10-20");
    expect(byId.M1).toMatchObject({ meetingDate: "2026-09-01", approximate: true });
    expect(r.files).toHaveLength(7);
    // meetingDate desc, undated last
    expect(r.files.map((f) => f.id).slice(0, 3)).toEqual(["A1", "M1", "A2"]);
    expect(r.files.at(-1)?.meetingDate).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it("respects maxDepth: deeper folders are listed but not descended", async () => {
    const chain: Record<string, Raw[]> = {
      R: [entry("L1", "one", FOLDER), entry("f0", "file0")],
      L1: [entry("L2", "two", FOLDER)],
      L2: [entry("L3", "three", FOLDER)],
      L3: [entry("L4", "four", FOLDER), entry("f3", "file3")],
      L4: [entry("f4", "file4")],
    };
    const log: string[] = [];
    const r = await listTree("R", "k", treeFetch(chain, log), 3);
    if (!r.ok) throw new Error("expected ok");
    expect(log.sort()).toEqual(["L1", "L2", "L3", "R"]);
    const ids = r.files.map((f) => f.id);
    expect(ids).toContain("L4");
    expect(ids).toContain("f3");
    expect(ids).not.toContain("f4");
    expect(r.files.find((f) => f.id === "L4")).toMatchObject({ isFolder: true, path: ["one", "two", "three"] });

    const log0: string[] = [];
    const r0 = await listTree("R", "k", treeFetch(chain, log0), 0);
    expect(r0.ok && r0.files.map((f) => f.id).sort()).toEqual(["L1", "f0"]);
    expect(log0).toEqual(["R"]);
  });

  it("caps concurrency at 6", async () => {
    const children = Array.from({ length: 20 }, (_, i) => entry(`S${i}`, `sub ${i}`, FOLDER));
    const tree: Record<string, Raw[]> = { R: children };
    for (const c of children) tree[c.id] = [entry(`${c.id}-f`, `file in ${c.id}`)];
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ files: tree[parentOf(input)] ?? [] });
    }) as unknown as typeof fetch;
    const r = await listTree("R", "k", fetchImpl);
    expect(r.ok && r.files.length).toBe(40);
    expect(peak).toBe(6);
  });

  it("is all-or-nothing: a failing subfolder fails the root with the root's folderUrl", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const id = parentOf(input);
      return id === "M10" ? new Response("{}", { status: 403 }) : json({ files: TREE[id] ?? [] });
    }) as unknown as typeof fetch;
    const r = await listTree("ROOT", KEY, fetchImpl);
    expect(r).toEqual({ ok: false, folderUrl: folderUrl("ROOT"), reason: "HTTP 403" });
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain("ROOT");
    expect(text).toContain("HTTP 403");
    expect(text).not.toContain(KEY);
  });

  it("returns the same files regardless of response completion order", async () => {
    const tree: Record<string, Raw[]> = {
      R: [entry("S1", "one", FOLDER), entry("S2", "two", FOLDER), entry("S3", "three", FOLDER)],
      S1: [entry("b-id", "Same 2026-05-05"), entry("a-id", "Same 2026-05-05")],
      S2: [entry("c-id", "Same 2026-05-05"), entry("a-id2", "Other 2026-05-05")],
      S3: [entry("d-id", "Same 2026-05-05")],
    };
    const run = async (delays: Record<string, number>) => {
      const fetchImpl = (async (input: RequestInfo | URL) => {
        const id = parentOf(input);
        await new Promise((r) => setTimeout(r, delays[id] ?? 0));
        return json({ files: tree[id] ?? [] });
      }) as unknown as typeof fetch;
      const r = await listTree("R", "k", fetchImpl);
      if (!r.ok) throw new Error("expected ok");
      return r.files;
    };
    const forward = await run({ S1: 1, S2: 15, S3: 30 });
    const backward = await run({ S1: 30, S2: 15, S3: 1 });
    expect(backward).toEqual(forward);
    const sameName = forward.filter((f) => f.name === "Same 2026-05-05").map((f) => f.id);
    expect(sameName).toEqual(["a-id", "b-id", "c-id", "d-id"]);
  });

  it("returns ok for a tree containing an empty subfolder whose response is {}", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) =>
      parentOf(input) === "R" ? json({ files: [entry("E", "empty", FOLDER), entry("F", "file")] }) : json({})) as unknown as typeof fetch;
    const r = await listTree("R", "k", fetchImpl);
    expect(r.ok && r.files.map((f) => f.id).sort()).toEqual(["E", "F"]);
  });

  it("reports the failure of the first failing folder in listing order, not the first to finish", async () => {
    const tree: Record<string, Raw[]> = {
      R: [entry("S1", "one", FOLDER), entry("S2", "two", FOLDER), entry("S3", "three", FOLDER)],
    };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const id = parentOf(input);
      if (id === "S1") {
        await new Promise((r) => setTimeout(r, 30));
        return new Response("{}", { status: 403 });
      }
      if (id === "S2") return new Response("{}", { status: 404 });
      return json({ files: tree[id] ?? [] });
    }) as unknown as typeof fetch;
    const r = await listTree("R", "k", fetchImpl);
    expect(r).toEqual({ ok: false, folderUrl: folderUrl("R"), reason: "HTTP 403" });
  });

  it("retries a 5xx on a subfolder", async () => {
    const calls: Record<string, number> = {};
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const id = parentOf(input);
      calls[id] = (calls[id] ?? 0) + 1;
      if (id === "M10" && calls[id] === 1) return new Response("", { status: 503 });
      return json({ files: TREE[id] ?? [] });
    }) as unknown as typeof fetch;
    const r = await listTree("ROOT", "k", fetchImpl);
    expect(r.ok).toBe(true);
    expect(calls.M10).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stops scheduling new requests after a failure and settles", async () => {
    const children = Array.from({ length: 30 }, (_, i) => entry(`S${i}`, `sub ${i}`, FOLDER));
    const seen: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const id = parentOf(input);
      seen.push(id);
      if (id === "R") return json({ files: children });
      await new Promise((r) => setTimeout(r, 5));
      return id === "S0" ? new Response("{}", { status: 403 }) : json({ files: [] });
    }) as unknown as typeof fetch;
    const r = await listTree("R", "k", fetchImpl);
    expect(!r.ok && r.reason).toBe("HTTP 403");
    // root + at most one full pool of six; nothing scheduled after the failure
    expect(seen.length).toBeLessThanOrEqual(7);
    const before = seen.length;
    await new Promise((res) => setTimeout(res, 30));
    expect(seen.length).toBe(before);
  });

  it("fails without fetching on missing key, blank ID, and OFFLINE=1", async () => {
    const spy = vi.fn();
    const f = spy as unknown as typeof fetch;
    expect(await listTree("R", undefined, f)).toEqual({ ok: false, folderUrl: folderUrl("R"), reason: "no API key" });
    const blank = await listTree("", "k", f);
    expect(!blank.ok && blank.reason).toBe("no folder ID");
    expect(warn).toHaveBeenCalledTimes(2);
    process.env.OFFLINE = "1";
    expect(await listTree("R", "k", f)).toEqual({ ok: false, folderUrl: folderUrl("R"), reason: "offline" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("listTree: an empty root is a failure, not a fact", () => {
  // files.list answers 200 with no files when link sharing is removed from a folder, so "nothing here" is
  // far more likely a sharing change than the truth for a published root.
  it("fails with 'empty listing' when the root lists nothing, and warns once", async () => {
    const r = await listTree("ROOT", "k", mockFetch({ files: [] }));
    expect(r).toEqual({ ok: false, folderUrl: folderUrl("ROOT"), reason: "empty listing" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toBe('[drive] folder "ROOT" not listed: empty listing; falling back to a link');
  });

  it("fails when the tree holds only folders", async () => {
    const tree: Record<string, Raw[]> = {
      R: [entry("Y", "2026-2027", FOLDER)],
      Y: [entry("M", "26 10 October", FOLDER)],
      M: [],
    };
    const r = await listTree("R", "k", treeFetch(tree));
    expect(!r.ok && r.reason).toBe("empty listing");
  });

  it("is ok when one file exists anywhere in the tree", async () => {
    const tree: Record<string, Raw[]> = {
      R: [entry("Y", "2026-2027", FOLDER)],
      Y: [entry("M", "26 10 October", FOLDER)],
      M: [entry("A", "AVCA Proposed Agenda 10.20.2026")],
    };
    const r = await listTree("R", "k", treeFetch(tree));
    expect(r.ok && r.files.filter((f) => !f.isFolder).map((f) => f.id)).toEqual(["A"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("listTree: Drive shortcuts", () => {
  const SHORTCUT = "application/vnd.google-apps.shortcut";

  it("skips a shortcut: it can point outside the published folders", async () => {
    const tree: Record<string, Raw[]> = {
      R: [entry("S", "Board contact list", SHORTCUT), entry("F", "Plan.pdf", "application/pdf"), entry("D", "Old", FOLDER)],
      D: [entry("S2", "Shortcut to a folder", SHORTCUT), entry("G", "Older plan.pdf", "application/pdf")],
    };
    const log: string[] = [];
    const r = await listTree("R", "k", treeFetch(tree, log));
    if (!r.ok) throw new Error("expected ok");
    expect(r.files.map((f) => f.id).sort()).toEqual(["D", "F", "G"]);
    expect(JSON.stringify(r.files)).not.toContain("Board contact list");
    expect(log.sort()).toEqual(["D", "R"]);
  });

  it("does not count a shortcut as a file: a root holding only shortcuts is an empty listing", async () => {
    const r = await listTree("R", "k", mockFetch({ files: [entry("S", "Elsewhere", SHORTCUT)] }));
    expect(!r.ok && r.reason).toBe("empty listing");
  });
});

describe("loadAllFolders", () => {
  const settings = {
    drive: {
      bylaws: "ID_BYLAWS",
      bylawsCurrentFileId: "ID_CURRENT",
      meetings: "ID_MEETINGS",
      presentations: "ID_PRES",
      letters: "ID_LETTERS",
      neighborhoodPlan: "ID_PLAN",
      history: "ID_HISTORY",
    },
  } as unknown as Settings;

  it("returns the five keys and does not list history", async () => {
    const log: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      log.push(parentOf(input));
      return json({ files: [entry("x", "A")] });
    }) as unknown as typeof fetch;
    const r = await loadAllFolders(settings, "k", fetchImpl);
    expect(Object.keys(r).sort()).toEqual(["bylaws", "letters", "meetings", "neighborhoodPlan", "presentations"]);
    expect(Object.values(r).every((v) => v.ok)).toBe(true);
    expect(r.meetings.folderUrl).toBe(folderUrl("ID_MEETINGS"));
    expect(log.sort()).toEqual(["ID_BYLAWS", "ID_LETTERS", "ID_MEETINGS", "ID_PLAN", "ID_PRES"]);
  });

  it("degrades per root: a blank ID fails only that root", async () => {
    const s = { drive: { ...settings.drive, letters: "" } } as unknown as Settings;
    const r = await loadAllFolders(s, "k", mockFetch({ files: [entry("x", "A")] }));
    expect(!r.letters.ok && r.letters.reason).toBe("no folder ID");
    expect(r.bylaws.ok).toBe(true);
  });

  it("without a key returns five ok:false results and never throws", async () => {
    const spy = vi.fn();
    const r = await loadAllFolders(settings, undefined, spy as unknown as typeof fetch);
    expect(Object.values(r).every((v) => !v.ok && v.reason === "no API key")).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(5);
  });

  it("short-circuits on OFFLINE=1", async () => {
    process.env.OFFLINE = "1";
    const spy = vi.fn();
    const r = await loadAllFolders(settings, "k", spy as unknown as typeof fetch);
    expect(Object.values(r).every((v) => !v.ok && v.reason === "offline")).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
