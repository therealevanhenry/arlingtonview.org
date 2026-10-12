/**
 * Renders populated-state previews of the home, Meetings, and Documents pages into dist/_preview/
 * for the browser tests. Run with `npm run preview:fixtures` (needs an existing build).
 *
 * `loadSiteData` is mocked, so no network and no clock are involved; pages are rendered through
 * Astro's container API. The container does not emit the layout's CSS, so the real built stylesheet
 * is linked in, and the font preloads (which the container resolves to dev paths) are pointed at the
 * built font files. Output is byte-stable for a given build.
 *
 * dist/_preview must never be deployed: `npm run build` wipes dist/, and tests/build.test.ts fails if
 * the directory exists.
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it, vi } from "vitest";
import type { Meeting } from "../../src/lib/calendar";
import type { SiteData } from "../../src/lib/data";
import type { DriveRoot, FolderResult } from "../../src/lib/drive";
import Documents from "../../src/pages/documents.astro";
import Home from "../../src/pages/index.astro";
import Meetings from "../../src/pages/meetings.astro";
import { scenarios } from "./fixtures";

const state = vi.hoisted(() => ({ meetings: [] as Meeting[], folders: {} as Record<DriveRoot, FolderResult> }));

vi.mock("../../src/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/data")>();
  const { buildArchive, currentBylaws } = await import("../../src/lib/archive");
  const { FIXTURE_NOW: now, FIXTURE_SETTINGS: settings } = await import("./fixtures");
  return {
    ...actual,
    // `satisfies` ties the mock to the real SiteData: a new field there fails `astro check` here.
    loadSiteData: async () =>
      ({
        settings,
        now,
        calendar: { ok: true, meetings: state.meetings },
        folders: state.folders,
        rows: buildArchive(state.meetings, state.folders),
        currentBylaws: currentBylaws(settings.drive.bylawsCurrentFileId, state.folders.bylaws),
      }) satisfies SiteData,
  };
});

const DIST = resolve(process.cwd(), "dist");
const ASTRO = resolve(DIST, "_astro");
const PAGES = { "home-virtual": Home, "home-in-person": Home, meetings: Meetings, documents: Documents } as const;

function builtAsset(prefix: string, ext: string): string {
  const found = readdirSync(ASTRO)
    .filter((name) => name.startsWith(prefix) && name.endsWith(ext))
    .sort();
  if (found.length === 0) throw new Error(`dist/_astro has no ${prefix}*${ext}; run a build first`);
  if (found.length > 1) throw new Error(`dist/_astro has several ${prefix}*${ext} (${found.join(", ")}); the preview linker assumes one`);
  return `/_astro/${found[0]}`;
}

it("writes the fixture previews", async () => {
  if (!existsSync(ASTRO)) throw new Error("dist/_astro not found; run a build before preview:fixtures");
  rmSync(resolve(DIST, "_preview"), { recursive: true, force: true });
  const css = builtAsset("Base.", ".css");
  const container = await AstroContainer.create();
  for (const scenario of scenarios()) {
    state.meetings = scenario.meetings;
    state.folders = scenario.folders;
    const route = scenario.slug.startsWith("home") ? "" : `${scenario.slug}/`;
    const html = await container.renderToString(PAGES[scenario.slug], {
      request: new Request(`https://arlingtonview.org/${route}`),
    });
    const fixed = html
      .replace(/href="\/node_modules\/@fontsource\/[^"]*\/files\/([^"/]+)\.woff2"/g, (_m, base: string) => `href="${builtAsset(`${base}.`, ".woff2")}"`)
      .replace("</head>", `<link rel="stylesheet" href="${css}"></head>`);
    mkdirSync(resolve(DIST, "_preview", scenario.slug), { recursive: true });
    writeFileSync(resolve(DIST, "_preview", scenario.slug, "index.html"), fixed);
  }
});
