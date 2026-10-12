/**
 * axe-core scan with the WCAG 2.0/2.1 A and AA rule tags. Zero violations on every real page and
 * every fixture preview. No rule is disabled; color-contrast in particular is always on.
 *
 * A second test per page covers contrast axe could not determine ("incomplete"): it is measured here.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ALL_PAGES, measureContrast, open } from "./support";

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

  // axe marks text "incomplete" when it cannot work out the background (e.g. an ancestor has a ::before
  // box, like the home notice's cornice). That is not a pass, so measure each such element ourselves:
  // WCAG ratio against the nearest painted ancestor background, and no ancestor pseudo-element box may
  // overlap the element (if one does, the background really is indeterminate and the test fails).
  test(`color-contrast is determined or measured: ${name}`, async ({ page }) => {
    await open(page, path);
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const targets = results.incomplete
      .filter((v) => v.id === "color-contrast")
      .flatMap((v) => v.nodes.map((n) => String(n.target[0])));
    const failures: string[] = [];
    for (const target of targets) {
      const m = await measureContrast(page.locator(target).first());
      if (m.overlappedBy.length > 0) failures.push(`${m.element}: pseudo-element overlap, background indeterminate: ${m.overlappedBy.join("; ")}`);
      if (m.ratio < m.required) {
        failures.push(`${m.element}: ${m.color} on ${m.background} = ${m.ratio.toFixed(2)}:1, needs ${m.required}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
}
