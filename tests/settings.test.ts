import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { boardSchema, resourcesSchema, settingsSchema } from "../src/content.config";
import { getBoard, getResources, getSettings, isConfigured, type Settings } from "../src/lib/settings";

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

  it("has exactly the seven drive keys", async () => {
    const settings = settingsSchema.parse(await load("settings.yaml"));
    expect(Object.keys(settings.drive).sort()).toEqual(
      [
        "bylaws",
        "bylawsCurrentFileId",
        "history",
        "letters",
        "meetings",
        "neighborhoodPlan",
        "presentations",
      ].sort(),
    );
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
  it("accepts the committed board file, which carries no names", async () => {
    const board = boardSchema.parse(await load("board.yaml"));
    expect(board.officers).toEqual([]);
    expect(board.blockCaptains).toEqual([]);
  });

  it("accepts a roster with a valid term", () => {
    const board = boardSchema.parse({
      term: { start: "2026-09", end: "2027-08" },
      officers: [{ role: "President", name: "A. Person" }],
      blockCaptains: [{ block: 1, names: ["B. Person"] }],
    });
    expect(board.term?.end).toBe("2027-08");
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
    expect((await getBoard()).officers).toEqual([]);
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
