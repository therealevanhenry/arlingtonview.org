import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import Footer from "../src/components/Footer.astro";
import Header from "../src/components/Header.astro";
import Base from "../src/layouts/Base.astro";

const ORIGIN = "https://arlingtonview.org";
let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

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

  it("omits the last-updated line when no value is passed", async () => {
    const html = await container.renderToString(Footer, {
      props: { contactEmail: "president@arlingtonview.org" },
    });
    expect(html).not.toContain("Last updated");
  });

  it("formats lastUpdated as a New York calendar date", async () => {
    // 02:30 UTC on October 7 is still the evening of October 6 in Arlington.
    const html = await container.renderToString(Footer, {
      props: { contactEmail: "president@arlingtonview.org", lastUpdated: "2026-10-07T02:30:00Z" },
    });
    expect(html).toMatch(/Last updated\s*<time datetime="2026-10-07T02:30:00Z">October 6, 2026<\/time>/);
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
  const routes = ["/meetings", "/documents", "/about", "/join", "/resources"];

  it("lists the five sections in order and links the wordmark home", async () => {
    const html = await container.renderToString(Header, { request: at("/") });
    const hrefs = [...html.matchAll(/<a[^>]*class="site-nav-link"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(routes);
    expect(html).toMatch(/<a[^>]*class="brand"[^>]*href="\/"/);
    expect(html).not.toContain("aria-current");
  });

  it("marks the section that contains the current page", async () => {
    const html = await container.renderToString(Header, { request: at("/about/history/") });
    const current = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    expect(current).toEqual(["/about"]);
  });

  it("marks a top-level section page", async () => {
    const html = await container.renderToString(Header, { request: at("/meetings") });
    const current = [...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
    expect(current).toEqual(["/meetings"]);
  });
});

describe("Base", () => {
  it("titles an inner page as '<title> | Arlington View Civic Association'", async () => {
    const html = await container.renderToString(Base, {
      request: at("/meetings/"),
      props: { title: "Meetings", description: "When and where AVCA meets." },
      slots: { default: "<h1>Meetings</h1>" },
    });
    expect(html).toContain("<title>Meetings | Arlington View Civic Association</title>");
    expect(html).toContain('<meta name="description" content="When and where AVCA meets.">');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta name="viewport"');
  });

  it("titles the home page with the organization name alone and a default description", async () => {
    const html = await container.renderToString(Base, {
      request: at("/"),
      props: { title: "Home" },
      slots: { default: "<h1>Arlington View Civic Association</h1>" },
    });
    expect(html).toContain("<title>Arlington View Civic Association</title>");
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}">/);
  });

  it("ships no script and opens nothing in a new tab", async () => {
    const html = await container.renderToString(Base, {
      request: at("/"),
      props: { title: "Home", lastUpdated: "2026-09-30T14:00:00Z" },
      slots: { default: "<h1>Arlington View Civic Association</h1>" },
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("target=");
    expect(html).toContain("September 30, 2026");
  });
});
