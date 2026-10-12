import { expect, type Locator, type Page } from "@playwright/test";

/** The eight real pages, built with OFFLINE=1 (every page in its fallback state). */
export const REAL_PAGES = [
  { name: "home", path: "/" },
  { name: "meetings", path: "/meetings/" },
  { name: "documents", path: "/documents/" },
  { name: "about", path: "/about/" },
  { name: "history", path: "/about/history/" },
  { name: "join", path: "/join/" },
  { name: "resources", path: "/resources/" },
  { name: "404", path: "/404.html" },
] as const;

/** Populated-state fixture previews written by `npm run preview:fixtures` (tests/preview/). */
export const PREVIEW_PAGES = [
  { name: "preview home-virtual", path: "/_preview/home-virtual/" },
  { name: "preview home-in-person", path: "/_preview/home-in-person/" },
  { name: "preview meetings", path: "/_preview/meetings/" },
  { name: "preview documents", path: "/_preview/documents/" },
] as const;

export const ALL_PAGES = [...REAL_PAGES, ...PREVIEW_PAGES];

export const PREVIEW = {
  homeVirtual: "/_preview/home-virtual/",
  homeInPerson: "/_preview/home-in-person/",
  meetings: "/_preview/meetings/",
  documents: "/_preview/documents/",
} as const;

export interface Probe {
  consoleErrors: string[];
  failedRequests: string[];
  /** Every request URL the page made (data: URLs excluded). */
  requests: string[];
}

/** Opens `path` with listeners attached from the first request, waits for web fonts, returns what was observed. */
export async function open(page: Page, path: string): Promise<Probe> {
  const probe: Probe = { consoleErrors: [], failedRequests: [], requests: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") probe.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => probe.consoleErrors.push(`pageerror: ${err.message}`));
  page.on("request", (req) => {
    if (!req.url().startsWith("data:")) probe.requests.push(req.url());
  });
  page.on("requestfailed", (req) => probe.failedRequests.push(`${req.url()} (${req.failure()?.errorText ?? "failed"})`));
  page.on("response", (res) => {
    if (res.status() >= 400) probe.failedRequests.push(`${res.url()} (HTTP ${res.status()})`);
  });
  await page.goto(path);
  await settle(page);
  return probe;
}

/** Fonts are loaded lazily on first use; wait for every pending load to finish before measuring. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Resize, then wait for the layout to settle (two animation frames) rather than sleeping. */
export async function resize(page: Page, width: number, height = 900): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

export const hasNoHorizontalScroll = (page: Page): Promise<{ scrollWidth: number; clientWidth: number }> =>
  page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

export async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number; right: number; bottom: number }> {
  const b = await locator.boundingBox();
  expect(b, "element has no box (is it rendered?)").not.toBeNull();
  const { x, y, width, height } = b!;
  return { x, y, width, height, right: x + width, bottom: y + height };
}

export const slug = (name: string): string => name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
