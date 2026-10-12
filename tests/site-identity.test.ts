import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import astroConfig from "../astro.config.mjs";
import { getSettings } from "../src/lib/settings";

/**
 * The site's address is written in three committed places, and they must agree:
 *   - `site` in astro.config.mjs (the origin of canonical links in a local build),
 *   - `siteUrl` in src/content/settings.yaml (the origin that may be indexed; see Base.astro),
 *   - public/CNAME (the custom domain GitHub Pages serves).
 * The rule is that they agree, not what they say: all three are read here, none is pinned. Moving the
 * site to another domain means changing all three in one commit.
 */
describe("the site address", () => {
  it("is the same in astro.config.mjs, settings.yaml, and public/CNAME", async () => {
    const { siteUrl } = await getSettings();
    const site = astroConfig.site;
    const cname = readFileSync("public/CNAME", "utf8");
    expect(site, "astro.config.mjs: site must be set").toBeTypeOf("string");
    expect(
      new URL(siteUrl).origin,
      `src/content/settings.yaml: siteUrl (${siteUrl}) must have the same origin as site in astro.config.mjs (${site}); change them together, with public/CNAME`,
    ).toBe(new URL(site as string).origin);
    expect(
      cname.trim(),
      `public/CNAME (${cname.trim()}) must be the host of src/content/settings.yaml: siteUrl (${siteUrl}); change them together, with site in astro.config.mjs`,
    ).toBe(new URL(siteUrl).host);
  });

  it("public/CNAME is one bare host name, as GitHub Pages requires", () => {
    const cname = readFileSync("public/CNAME", "utf8");
    expect(cname.trim()).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    expect(cname.trim().split(/\s+/)).toHaveLength(1);
  });
});
