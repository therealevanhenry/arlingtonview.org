/**
 * axe-core scan with the WCAG 2.0/2.1 A and AA rule tags. Zero violations on every real page and
 * every fixture preview. No rule is disabled; color-contrast in particular is always on.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ALL_PAGES, open } from "./support";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const { name, path } of ALL_PAGES) {
  test(`axe WCAG A/AA: ${name}`, async ({ page }) => {
    await open(page, path);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const summary = results.violations.map((v) => ({
      rule: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.html.slice(0, 200)),
    }));
    expect(summary).toEqual([]);
  });
}
