import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Footer from "../src/components/Footer.astro";
import Header from "../src/components/Header.astro";
import Base from "../src/layouts/Base.astro";
import { getSettings } from "../src/lib/settings";
import { formatCalendarDate } from "../src/lib/time";

const ORIGIN = "https://arlingtonview.org";
const FULL_TRACE_VIEWBOX = "0 0 371.8 392.3";
// A distinctive run from the full trace's path data, read from the file so it follows the asset.
const FULL_TRACE_PATH = /\sd="([^"]{60})/.exec(readFileSync("src/assets/logo.svg", "utf8"))?.[1] ?? "";
let container: AstroContainer;
// Owner-edited content: titles are asserted against the configured name, not a literal.
let siteName: string;
let containerWithSite: AstroContainer;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeAll(async () => {
  siteName = escapeHtml((await getSettings()).siteName);
  container = await AstroContainer.create();
  containerWithSite = await AstroContainer.create({
    astroConfig: { site: ORIGIN, trailingSlash: "always" },
  });
});

const countOccurrences = (html: string, needle: string): number => html.split(needle).length - 1;

function at(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

describe("Footer", () => {
  it("links the contact email and the site source", async () => {
    const html = await container.renderToString(Footer, {
      props: { contactEmail: "president@arlingtonview.org" },
    });
    expect(html).toContain('href="mailto:president@arlingtonview.org"');
    expect(html).toContain('href="https://github.com/therealevanhenry/arlingtonview.org"');
    expect(html).toContain("Site source on GitHub");
    expect(html).not.toContain("target=");
  });

  it("inlines the small mark, not the full trace", async () => {
    const html = await container.renderToString(Footer, {
      props: { contactEmail: "president@arlingtonview.org" },
    });
    expect(html).toMatch(/<svg[^>]*class="site-footer-mark"[^>]*aria-hidden="true"/);
    expect(html).not.toContain("<img");
    expect(html).not.toContain(FULL_TRACE_VIEWBOX);
  });

  it("omits the documents-updated line when no value is passed", async () => {
    const html = await container.renderToString(Footer, {
      props: { contactEmail: "president@arlingtonview.org" },
    });
    expect(html).not.toContain("updated");
    expect(html).not.toContain("<time");
  });

  it("says Documents updated (the date is the newest Drive file's, not the page's), as a New York calendar date", async () => {
    // 02:30 UTC on October 7 is still the evening of October 6 in Arlington.
    const html = await container.renderToString(Footer, {
      props: { contactEmail: "president@arlingtonview.org", lastUpdated: "2026-10-07T02:30:00Z" },
    });
    expect(html).toMatch(/Documents updated\s*<time datetime="2026-10-07T02:30:00Z">October 6, 2026<\/time>/);
    expect(html).not.toContain("Last updated");
  });

  it("uses the shared calendar-date formatter", async () => {
    for (const iso of ["2026-01-01T04:59:59Z", "2026-07-04T16:00:00Z", "2027-03-14T07:30:00Z"]) {
      const html = await container.renderToString(Footer, { props: { contactEmail: "president@arlingtonview.org", lastUpdated: iso } });
      expect(html, iso).toContain(`>${formatCalendarDate(new Date(iso))}</time>`);
    }
  });

  it("fails loudly on an unparseable lastUpdated", async () => {
    await expect(
      container.renderToString(Footer, {
        props: { contactEmail: "president@arlingtonview.org", lastUpdated: "not a date" },
      }),
    ).rejects.toThrow(/lastUpdated/);
  });
});

describe("Header", () => {
  const routes = ["/meetings/", "/documents/", "/about/", "/join/", "/resources/"];

  it("lists the five sections in order and links the wordmark home", async () => {
    const html = await container.renderToString(Header, { request: at("/") });
    const hrefs = [...html.matchAll(/<a[^>]*class="site-nav-link"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(routes);
    expect(html).toMatch(/<a[^>]*class="brand"[^>]*href="\/"/);
    expect(html).not.toContain("aria-current");
  });

  it("inlines the small mark, not the full trace", async () => {
    const html = await container.renderToString(Header, { request: at("/") });
    expect(html).toMatch(/<svg[^>]*class="brand-mark"[^>]*aria-hidden="true"/);
    expect(html).not.toContain(FULL_TRACE_VIEWBOX);
  });

  it("marks the section that contains the current page", async () => {
    const html = await container.renderToString(Header, { request: at("/about/history/") });
    const current = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    expect(current).toEqual(["/about/"]);
  });

  it("marks a top-level section page, with or without the trailing slash in the request", async () => {
    for (const path of ["/meetings/", "/meetings"]) {
      const html = await container.renderToString(Header, { request: at(path) });
      const current = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
      expect(current).toEqual(["/meetings/"]);
    }
  });
});

describe("Header under a non-root base", () => {
  it("prefixes every href and marks the current section", async () => {
    vi.stubEnv("BASE_URL", "/arlingtonview.org/");
    const html = await container.renderToString(Header, { request: at("/arlingtonview.org/about/history/") });
    const hrefs = [...html.matchAll(/<a[^>]*class="site-nav-link"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(
      ["/meetings/", "/documents/", "/about/", "/join/", "/resources/"].map((r) => `/arlingtonview.org${r}`),
    );
    expect(html).toMatch(/<a[^>]*class="brand"[^>]*href="\/arlingtonview\.org\/"/);
    const current = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    expect(current).toEqual(["/arlingtonview.org/about/"]);
  });
});

describe("Base", () => {
  it("titles an inner page as '<title> | Arlington View Civic Association'", async () => {
    const html = await container.renderToString(Base, {
      request: at("/meetings/"),
      props: { title: "Meetings", description: "When and where AVCA meets." },
      slots: { default: "<h1>Meetings</h1>" },
    });
    expect(html).toContain(`<title>Meetings | ${siteName}</title>`);
    expect(html).toContain('<meta name="description" content="When and where AVCA meets.">');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta name="viewport"');
  });

  it("titles the home page with the organization name alone and a default description", async () => {
    const html = await container.renderToString(Base, {
      request: at("/"),
      props: { home: true },
      slots: { default: "<h1>Arlington View Civic Association</h1>" },
    });
    expect(html).toContain(`<title>${siteName}</title>`);
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}">/);
  });

  it("decides the home title from the home prop, not the pathname", async () => {
    const asHome = await container.renderToString(Base, {
      request: at("/meetings/"),
      props: { home: true },
      slots: { default: "<h1>x</h1>" },
    });
    expect(asHome).toContain(`<title>${siteName}</title>`);
    const notHome = await container.renderToString(Base, {
      request: at("/"),
      props: { title: "Home" },
      slots: { default: "<h1>x</h1>" },
    });
    expect(notHome).toContain(`<title>Home | ${siteName}</title>`);
  });

  it("omits the canonical link when no site is configured", async () => {
    const html = await container.renderToString(Base, {
      request: at("/meetings/"),
      props: { title: "Meetings" },
      slots: { default: "<h1>Meetings</h1>" },
    });
    expect(html).not.toContain('rel="canonical"');
  });

  it("builds the canonical link in trailing-slash form", async () => {
    const cases: Array<[string, string]> = [
      ["/", `${ORIGIN}/`],
      ["/meetings/", `${ORIGIN}/meetings/`],
      ["/meetings", `${ORIGIN}/meetings/`],
      ["/about/history/", `${ORIGIN}/about/history/`],
    ];
    for (const [path, expected] of cases) {
      const html = await containerWithSite.renderToString(Base, {
        request: at(path),
        props: { title: "Page" },
        slots: { default: "<h1>Page</h1>" },
      });
      expect(html).toContain(`<link rel="canonical" href="${expected}">`);
    }
  });

  describe("robots: only the canonical site may be indexed", () => {
    const NOINDEX = '<meta name="robots" content="noindex">';
    const render = async (site: string | undefined): Promise<string> => {
      const c = site === undefined ? container : await AstroContainer.create({ astroConfig: { site, trailingSlash: "always" } });
      return c.renderToString(Base, { request: at("/meetings/"), props: { title: "Meetings" }, slots: { default: "<h1>Meetings</h1>" } });
    };

    it("says nothing when the build's origin is the origin of settings.siteUrl", async () => {
      // Read at test time: the rule is the comparison, not the value.
      const { siteUrl } = await getSettings();
      for (const site of [siteUrl, `${new URL(siteUrl).origin}/`, `${new URL(siteUrl).origin}/some/base/`]) {
        expect(await render(site), site).not.toContain('name="robots"');
      }
    });

    it("says noindex when the build is for another origin, e.g. the github.io preview", async () => {
      const { siteUrl } = await getSettings();
      const canonicalHost = new URL(siteUrl).host;
      for (const site of ["https://therealevanhenry.github.io", `https://www.${canonicalHost}`, `https://preview.${canonicalHost}`]) {
        const html = await render(site);
        expect(countOccurrences(html, NOINDEX), site).toBe(1);
        expect(html.indexOf(NOINDEX), site).toBeLessThan(html.indexOf("</head>"));
      }
    });

    it("says noindex when the build has no site at all", async () => {
      expect(countOccurrences(await render(undefined), NOINDEX)).toBe(1);
    });
  });

  it("keeps the full logo trace out of the page", async () => {
    const html = await container.renderToString(Base, {
      request: at("/"),
      props: { home: true },
      slots: { default: "<h1>Arlington View Civic Association</h1>" },
    });
    expect(FULL_TRACE_PATH.length).toBe(60);
    expect(html).not.toContain(FULL_TRACE_VIEWBOX);
    expect(html).not.toContain(FULL_TRACE_PATH);
  });

  it("ships no script and opens nothing in a new tab", async () => {
    const html = await container.renderToString(Base, {
      request: at("/"),
      props: { home: true, lastUpdated: "2026-09-30T14:00:00Z" },
      slots: { default: "<h1>Arlington View Civic Association</h1>" },
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("target=");
    expect(html).toContain("September 30, 2026");
  });

  it("takes the footer contact email from the site settings", async () => {
    const html = await container.renderToString(Base, {
      request: at("/"),
      props: { home: true },
      slots: { default: "<h1>Arlington View Civic Association</h1>" },
    });
    // Read at test time: the address is owner-edited content, so the test asserts the wiring, not the value.
    const { contactEmail } = await getSettings();
    expect(html).toContain(`href="mailto:${escapeHtml(contactEmail)}"`);
  });
});
