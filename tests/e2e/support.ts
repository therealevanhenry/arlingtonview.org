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

// Long unbreakable strings in the fixtures (tests/preview/fixtures.ts exports the same values; the specs
// do not import that file, which pulls in the site's source). documents.spec.ts checks they are on the page.
export const LONG_REAL_NAME = "AVCA_Article_V_Section_1_proposed_amendment";
export const LONG_MATERIAL_NAME = "Traffic_Calming_Study_Appendix_B_Speed_And_Volume_Counts_v02";
export const LONG_LOCATION = "Carver_Community_Center_Multipurpose_Room_East_Entrance_Second_Floor";

/** The right edge of an element's rendered text, and the viewport width it must stay inside. */
export async function textRightEdge(locator: Locator): Promise<{ right: number; viewport: number }> {
  return locator.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return { right: range.getBoundingClientRect().right, viewport: document.documentElement.clientWidth };
  });
}

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


// ---------- WCAG contrast (used where axe reports color-contrast as "incomplete") ----------

export type Rgba = { r: number; g: number; b: number; a: number };

/** Parses a computed `rgb()`/`rgba()` colour (what getComputedStyle returns for sRGB colours). */
export function parseRgba(css: string): Rgba {
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(css.trim());
  if (!m) throw new Error(`unsupported colour syntax: ${css}`);
  const alpha = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: alpha };
}

/** `top` drawn over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const mix = (t: number, b: number): number => t * top.a + b * (1 - top.a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** WCAG 2.x relative luminance of an opaque colour. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Large text per WCAG: at least 24px, or at least 18.66px and bold (700+). */
export const isLargeText = (fontSizePx: number, fontWeight: number): boolean =>
  fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

/** The page background (--paper) is the last resort when no ancestor paints one. */
const PAPER: Rgba = { r: 0xfb, g: 0xfa, b: 0xf7, a: 1 };

/** Background behind an element from its ancestors' computed backgrounds, nearest first, compositing any alpha. */
export function effectiveBackground(nearestFirst: string[]): Rgba {
  const layers: Rgba[] = [];
  let base = PAPER;
  for (const css of nearestFirst) {
    const c = parseRgba(css);
    if (c.a === 0) continue;
    layers.push(c);
    if (c.a === 1) {
      base = c;
      layers.pop();
      break;
    }
  }
  return layers.reduceRight((under, layer) => composite(layer, under), base);
}

export interface ContrastMeasurement {
  element: string;
  color: string;
  background: string;
  ratio: number;
  required: number;
  /** An ancestor's ::before/::after box overlaps this element's box (so its background is truly indeterminate). */
  overlappedBy: string[];
}

const hex = (c: Rgba): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** Measures one element in the page: its colour against the effective background, and any pseudo-element overlap. */
export async function measureContrast(locator: Locator): Promise<ContrastMeasurement> {
  const raw = await locator.evaluate((el) => {
    const backgrounds: string[] = [];
    const overlappedBy: string[] = [];
    const rect = el.getBoundingClientRect();
    for (let a: Element | null = el; a; a = a.parentElement) {
      backgrounds.push(getComputedStyle(a).backgroundColor);
      if (a === el) continue;
      const box = a.getBoundingClientRect();
      for (const which of ["::before", "::after"] as const) {
        const p = getComputedStyle(a, which);
        if (p.content === "none" || p.display === "none") continue;
        // Positioned pseudo-elements: top/left/width/height are used px values relative to the ancestor.
        // Anything not resolvable to pixels is treated as overlapping (the safe answer).
        const top = parseFloat(p.top);
        const left = parseFloat(p.left);
        const width = parseFloat(p.width);
        const height = parseFloat(p.height);
        const resolvable = p.position === "absolute" && [top, left, width, height].every(Number.isFinite);
        const pseudo = resolvable
          ? { top: box.top + top, bottom: box.top + top + height, left: box.left + left, right: box.left + left + width }
          : undefined;
        const overlaps =
          pseudo === undefined ||
          (rect.top < pseudo.bottom && rect.bottom > pseudo.top && rect.left < pseudo.right && rect.right > pseudo.left);
        if (overlaps) overlappedBy.push(`${a.tagName.toLowerCase()}.${a.className}${which} ${pseudo ? `(${Math.round(pseudo.top)}..${Math.round(pseudo.bottom)} vs element ${Math.round(rect.top)})` : "(unresolvable)"}`);
      }
    }
    const s = getComputedStyle(el);
    return {
      element: `<${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent ?? "").trim().slice(0, 30)}`,
      color: s.color,
      backgrounds,
      fontSize: parseFloat(s.fontSize),
      fontWeight: Number(s.fontWeight),
      overlappedBy,
    };
  });
  const background = effectiveBackground(raw.backgrounds);
  const fg = parseRgba(raw.color);
  const color = fg.a < 1 ? composite(fg, background) : fg;
  return {
    element: raw.element,
    color: hex(color),
    background: hex(background),
    ratio: contrastRatio(color, background),
    required: isLargeText(raw.fontSize, raw.fontWeight) ? 3 : 4.5,
    overlappedBy: raw.overlappedBy,
  };
}
