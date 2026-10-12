/**
 * Build-output assertions: the last line of defense before anything is deployed.
 *
 * These read the finished `dist/` directory, so they must not run in the default `npm test`
 * (CI runs that before any build exists). Two mechanisms keep them apart:
 *   - vitest.config.ts excludes this file from the default run;
 *   - vitest.build.config.ts includes only this file.
 * Run them with:
 *   npm run test:build   builds, then asserts (CI uses this, with OFFLINE=1)
 *   npm run test:dist    asserts against an existing dist/ without building (deploy workflow)
 *
 * Assertion 4 (no conferencing link) is the backstop for the owner's calendar feed, which carries a
 * Google Meet join link in every event description. The loader discards descriptions by design;
 * this test makes sure nothing ever leaks if that changes.
 *
 * Reproducibility (two builds compared) is deliberately not tested here; it is slow and belongs to
 * the deploy task.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const DIST = resolve(process.cwd(), "dist");
const EMAIL = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** The one address the site may print: `contactEmail` in settings.yaml, read at test time. */
function contactAddress(): string {
  const { contactEmail } = parse(readFileSync(resolve("src/content/settings.yaml"), "utf8")) as { contactEmail: string };
  return contactEmail.toLowerCase();
}
const EXPECTED_PAGES = [
  "index.html",
  "404.html",
  "meetings/index.html",
  "documents/index.html",
  "about/index.html",
  "about/history/index.html",
  "join/index.html",
  "resources/index.html",
];

function listHtmlFiles(dir: string = DIST): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listHtmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out.sort();
}

const rel = (file: string): string => relative(DIST, file).split(sep).join("/");

const pages = (): { name: string; html: string }[] =>
  listHtmlFiles().map((file) => ({ name: rel(file), html: readFileSync(file, "utf8") }));

/** Run `find` over every page and report each hit as "<file>: <string>". */
function offenders(find: (html: string) => string[]): string[] {
  return pages().flatMap(({ name, html }) => find(html).map((hit) => `${name}: ${hit}`));
}

/** The build's base path ("" for `/`, "/arlingtonview.org" otherwise), read from the stylesheet URL. */
function readBasePath(): string {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const match = /<link[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*?)\/_astro\/[^"]*"/.exec(html);
  if (!match) throw new Error("dist/index.html: no /_astro/ stylesheet link, cannot determine base path");
  return match[1] ?? "";
}

/** Every href, src, and srcset candidate URL in a page. */
function extractLinks(html: string): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/gi)) urls.push(m[1] ?? "");
  for (const m of html.matchAll(/\ssrcset="([^"]*)"/gi)) {
    for (const candidate of (m[1] ?? "").split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) urls.push(url);
    }
  }
  return urls;
}

const hasScheme = (url: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");

describe("build output (dist/)", () => {
  it("dist/ exists with HTML in it (run npm run build first)", () => {
    expect(listHtmlFiles().length, `no HTML files under ${DIST}`).toBeGreaterThan(0);
  });

  it("10. the expected eight pages exist", () => {
    const missing = EXPECTED_PAGES.filter((p) => !existsSync(join(DIST, p)));
    expect(missing, `missing pages: ${missing.join(", ")}`).toEqual([]);
  });

  it("1. no <script tag of any kind", () => {
    expect(offenders((h) => h.match(/<script/gi) ?? [])).toEqual([]);
  });

  it("2. exactly one <h1> per page", () => {
    const bad = pages()
      .map(({ name, html }) => ({ name, count: (html.match(/<h1[\s>]/gi) ?? []).length }))
      .filter(({ count }) => count !== 1)
      .map(({ name, count }) => `${name}: ${count} <h1> elements`);
    expect(bad).toEqual([]);
  });

  it("3. no target attribute (including target=_blank)", () => {
    expect(offenders((h) => h.match(/\starget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi) ?? [])).toEqual([]);
  });

  it("4. no conferencing join link anywhere", () => {
    const pattern = /zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com/gi;
    expect(offenders((h) => h.match(pattern) ?? [])).toEqual([]);
  });

  it("5. no gmail.com, and no email address other than settings.contactEmail", () => {
    // Page text must not type an address: the configured one is the only source (see JoinAction).
    const allowed = contactAddress();
    const bad = pages().flatMap(({ name, html }) => {
      const hits = (html.match(/gmail\.com/gi) ?? []).map((h) => `${name}: ${h}`);
      const emails = (html.replace(/&#39;|&#x27;/g, "'").match(EMAIL) ?? []).filter((e) => e.toLowerCase() !== allowed).map((e) => `${name}: ${e}`);
      return [...hits, ...emails];
    });
    expect(bad).toEqual([]);
  });

  it("6. internal links carry the base path, end in a slash (pages), and resolve to files in dist/", () => {
    const base = readBasePath();
    const bad: string[] = [];
    for (const { name, html } of pages()) {
      for (const url of extractLinks(html)) {
        if (url === "" || url.startsWith("#") || (hasScheme(url) && !url.startsWith("//"))) continue;
        if (url.startsWith("//")) continue; // protocol-relative: external
        if (!url.startsWith("/")) {
          bad.push(`${name}: ${url} (relative URL, must be root-relative with base)`);
          continue;
        }
        const withoutFragment = url.split("#")[0] ?? "";
        const fragment = url.includes("#") ? url.slice(url.indexOf("#")) : "";
        const path = withoutFragment.split("?")[0] ?? "";
        if (base !== "" && path !== `${base}` && !path.startsWith(`${base}/`)) {
          bad.push(`${name}: ${url} (does not start with base "${base}")`);
          continue;
        }
        const sitePath = path.slice(base.length) || "/";
        const lastSegment = sitePath.slice(sitePath.lastIndexOf("/") + 1);
        const isFile = lastSegment.includes(".");
        if (!isFile && !sitePath.endsWith("/")) {
          bad.push(`${name}: ${url} (page link must end with "/" or "/#fragment")`);
          continue;
        }
        if (fragment !== "" && isFile) {
          bad.push(`${name}: ${url} (fragment on a file link)`);
          continue;
        }
        const target = isFile ? sitePath : `${sitePath}index.html`;
        const onDisk = resolve(DIST, `.${target}`);
        if (!onDisk.startsWith(DIST + sep) || !existsSync(onDisk) || !statSync(onDisk).isFile()) {
          bad.push(`${name}: ${url} (no file at dist${target})`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("7. no data: URL over 4 KB and no inline <style> over 20 KB", () => {
    const bad = offenders((h) => {
      const hits: string[] = [];
      for (const m of h.matchAll(/data:[^"')\s>]*/gi)) {
        if (m[0].length > 4096) hits.push(`data: URL of ${m[0].length} bytes (${m[0].slice(0, 40)}...)`);
      }
      for (const m of h.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
        const size = Buffer.byteLength(m[1] ?? "", "utf8");
        if (size > 20480) hits.push(`inline <style> of ${size} bytes`);
      }
      return hits;
    });
    expect(bad).toEqual([]);
  });

  it("8. dist/CNAME is exactly arlingtonview.org", () => {
    const file = join(DIST, "CNAME");
    expect(existsSync(file), "dist/CNAME is missing").toBe(true);
    expect(readFileSync(file, "utf8"), "dist/CNAME content").toBe("arlingtonview.org");
  });

  it("9. dist/_preview does not exist", () => {
    expect(existsSync(join(DIST, "_preview")), "dist/_preview must never be in a checked or deployed build").toBe(false);
  });
});
