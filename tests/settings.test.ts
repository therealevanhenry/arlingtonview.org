import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { boardSchema, resourcesSchema, settingsSchema } from "../src/content.config";
import { getBoard, getResources, getSettings, isConfigured, parseContent, type Settings } from "../src/lib/settings";

async function load(file: string): Promise<unknown> {
  return parse(await fs.readFile(`src/content/${file}`, "utf8"));
}

describe("settingsSchema", () => {
  it("rejects a settings file missing calendarId", () => {
    expect(() => settingsSchema.parse({ siteName: "x" })).toThrow();
  });

  it("accepts the committed settings file", async () => {
    const settings = settingsSchema.parse(await load("settings.yaml"));
    expect(settings.contactEmail).toBe("president@arlingtonview.org");
  });

  it("rejects an extra drive key", async () => {
    const settings = (await load("settings.yaml")) as { drive: Record<string, string> };
    const withExtra = { ...settings, drive: { ...settings.drive, archive: "X" } };
    expect(() => settingsSchema.parse(withExtra)).toThrow();
  });

  it("rejects a misspelled top-level key", async () => {
    const settings = (await load("settings.yaml")) as Record<string, unknown>;
    const { calendarId, ...rest } = settings;
    expect(() => settingsSchema.parse({ ...rest, calandarId: calendarId })).toThrow();
    expect(() => settingsSchema.parse({ ...settings, calandarId: "x" })).toThrow();
  });

  it("requires joinFormUrl to be blank or an https:// URL", async () => {
    const settings = (await load("settings.yaml")) as Record<string, unknown>;
    for (const ok of ["", "https://forms.example.org/join"]) {
      expect(() => settingsSchema.parse({ ...settings, joinFormUrl: ok }), ok).not.toThrow();
    }
    for (const bad of ["http://forms.example.org/join", "forms.example.org", "ftp://x.test/", "https://", "javascript:alert(1)"]) {
      expect(() => settingsSchema.parse({ ...settings, joinFormUrl: bad }), bad).toThrow();
    }
  });
});

describe("board and resources strictness", () => {
  it("rejects unknown keys at every level", () => {
    const board = { officers: [{ role: "r", name: "n", kind: "elected" }], blockCaptains: [] };
    expect(() => boardSchema.parse({ ...board, officer: [] })).toThrow();
    expect(() => boardSchema.parse({ ...board, officers: [{ role: "r", name: "n", kind: "elected", phone: "1" }] })).toThrow();
    const res = { groups: [{ title: "g", links: [{ label: "l", url: "https://e.org/" }] }] };
    expect(() => resourcesSchema.parse(res)).not.toThrow();
    expect(() => resourcesSchema.parse({ ...res, group: [] })).toThrow();
    expect(() => resourcesSchema.parse({ groups: [{ title: "g", links: [{ label: "l", url: "https://e.org/", notes: "x" }] }] })).toThrow();
  });
});

describe("parseContent error messages", () => {
  it("names the file and the failing path for a schema error, on one line", () => {
    const text = "officers:\n  - { role: A, name: B, kind: elected }\n  - { role: C, name: D, kind: elected }\n  - { role: E, name: F, kind: elected }\n  - { role: G, name: H, kind: elected }\n  - { role: I, kind: elected }\nblockCaptains: []\n";
    let message = "";
    try {
      parseContent("board.yaml", text, boardSchema);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^src\/content\/board\.yaml: officers\[4\]\.name: /);
    expect(message).not.toContain("\n");
  });

  it("names the file and the line for a YAML syntax error, on one line", () => {
    let message = "";
    try {
      parseContent("settings.yaml", "siteName: ok\ndrive: [unclosed\n", settingsSchema);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^src\/content\/settings\.yaml: line \d+/);
    expect(message).not.toContain("\n");
  });

  it("names the key for an unknown key", async () => {
    const text = await fs.readFile("src/content/settings.yaml", "utf8");
    expect(() => parseContent("settings.yaml", `${text}calandarId: x\n`, settingsSchema)).toThrow(/settings\.yaml: .*calandarId/);
  });
});

describe("isConfigured", () => {
  it("reports joinFormUrl blank and everything else set for the committed file", async () => {
    const settings = settingsSchema.parse(await load("settings.yaml"));
    const status = isConfigured(settings);
    expect(status.joinFormUrl).toBe(false);
    expect(status.calendarId).toBe(true);
    for (const key of Object.keys(settings.drive)) {
      expect(status.drive[key as keyof typeof status.drive], `drive.${key}`).toBe(true);
    }
  });

  it("treats whitespace-only values as blank", async () => {
    const settings: Settings = settingsSchema.parse(await load("settings.yaml"));
    const status = isConfigured({ ...settings, calendarId: "  ", drive: { ...settings.drive, letters: "" } });
    expect(status.calendarId).toBe(false);
    expect(status.drive.letters).toBe(false);
    expect(status.drive.bylaws).toBe(true);
  });
});

describe("boardSchema", () => {
  it("accepts the committed board file", async () => {
    const board = boardSchema.parse(await load("board.yaml"));
    expect(board.officers.map((o) => o.role)).toContain("President");
  });

  it("accepts a roster with a valid term", () => {
    const board = boardSchema.parse({
      term: { start: "2026-09", end: "2027-08" },
      officers: [{ role: "President", name: "A. Person", kind: "elected" }],
      blockCaptains: [{ block: 1, names: ["B. Person"] }],
    });
    expect(board.term?.end).toBe("2027-08");
  });

  it("requires a known kind on every officer", () => {
    const officer = { role: "President", name: "A. Person" };
    const parse = (o: object) => boardSchema.parse({ officers: [o], blockCaptains: [] });
    expect(() => parse(officer)).toThrow();
    expect(() => parse({ ...officer, kind: "volunteer" })).toThrow();
    for (const kind of ["elected", "appointed", "honorary"]) expect(() => parse({ ...officer, kind }), kind).not.toThrow();
  });

  it("names the kind path when it is missing or unknown", () => {
    const text = (kind: string) => `officers:\n  - { role: A, name: B${kind} }\nblockCaptains: []\n`;
    expect(() => parseContent("board.yaml", text(""), boardSchema)).toThrow(/^src\/content\/board\.yaml: officers\[0\]\.kind: /);
    expect(() => parseContent("board.yaml", text(", kind: other"), boardSchema)).toThrow(/^src\/content\/board\.yaml: officers\[0\]\.kind: /);
  });

  it("accepts a vacant block with no names", () => {
    const board = boardSchema.parse({ officers: [], blockCaptains: [{ block: 4, names: [] }] });
    expect(board.blockCaptains[0].names).toEqual([]);
  });

  it("rejects a term with a malformed month", () => {
    for (const bad of ["2026-13", "2026-00", "2026-9", "26-09", "2026/09", "September 2026"]) {
      expect(
        () => boardSchema.parse({ term: { start: bad, end: "2027-08" }, officers: [], blockCaptains: [] }),
        bad,
      ).toThrow();
    }
  });
});

describe("resourcesSchema", () => {
  it("accepts the committed resources file", async () => {
    const { groups } = resourcesSchema.parse(await load("resources.yaml"));
    expect(groups.map((g) => g.title)).toEqual([
      "Report and get help",
      "Services",
      "County government",
      "Columbia Pike and civic",
    ]);
    expect(groups.map((g) => g.links.length)).toEqual([4, 7, 5, 4]);
  });

  it("starts every resource URL with https://", async () => {
    const { groups } = resourcesSchema.parse(await load("resources.yaml"));
    for (const link of groups.flatMap((g) => g.links)) {
      expect(link.url, link.label).toMatch(/^https:\/\//);
    }
  });

  it("rejects a non-https URL", () => {
    expect(() =>
      resourcesSchema.parse({ groups: [{ title: "g", links: [{ label: "l", url: "http://example.org/" }] }] }),
    ).toThrow();
  });
});

describe("loaders in plain Vitest (type import must not break unit tests)", () => {
  it("getSettings returns the committed settings", async () => {
    const settings = await getSettings();
    expect(settings.contactEmail).toBe("president@arlingtonview.org");
  });

  it("getBoard and getResources return parsed data", async () => {
    expect((await getBoard()).officers.length).toBeGreaterThan(0);
    expect((await getResources()).length).toBe(4);
  });
});

describe("content hygiene", () => {
  it("contains no gmail address and no target attribute", async () => {
    for (const f of ["settings.yaml", "board.yaml", "resources.yaml", "pages/about.md", "pages/join.md", "pages/history.md"]) {
      const text = await fs.readFile(`src/content/${f}`, "utf8");
      expect(text, f).not.toMatch(/gmail\.com/i);
      expect(text, f).not.toContain("target=");
    }
  });
});
