/**
 * The home page hero (the next-meeting notice) in the two populated fixture states, plus the quick
 * links grid on the real home page. Viewport widths are set explicitly, so these run the same way in
 * every project.
 */
import { expect, test } from "@playwright/test";
import { box, open, PREVIEW, resize } from "./support";

const readFirstLine = (selector: string) => async (page: import("@playwright/test").Page) =>
  page.locator(selector).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
    return { lines: tops.size, fontSize: parseFloat(getComputedStyle(el).fontSize) };
  });

test.describe("home hero (virtual meeting)", () => {
  test("month and day: one line, 48px+ at 375px", async ({ page }) => {
    await open(page, PREVIEW.homeVirtual);
    await resize(page, 375);
    const { lines, fontSize } = await readFirstLine(".notice-monthday")(page);
    expect(lines).toBe(1);
    expect(fontSize).toBeGreaterThanOrEqual(48);
  });

  test("month and day: one line, 100 to 120px at 1280px", async ({ page }) => {
    await open(page, PREVIEW.homeVirtual);
    await resize(page, 1280);
    const { lines, fontSize } = await readFirstLine(".notice-monthday")(page);
    expect(lines).toBe(1);
    expect(fontSize).toBeGreaterThanOrEqual(100);
    expect(fontSize).toBeLessThanOrEqual(120);
  });

  test("at 1280px the zones are side by side and their bottoms agree within a body line", async ({ page }) => {
    await open(page, PREVIEW.homeVirtual);
    await resize(page, 1280);
    const when = await box(page.locator(".notice-when"));
    const details = await box(page.locator(".notice-details"));
    expect(when.right).toBeLessThanOrEqual(details.x + 1);
    // Bottoms of the text in each zone (its last rendered line), not of the boxes: the links in the
    // actions row carry 44px of tap height whose padding is invisible.
    const bottoms = await page.evaluate(() => {
      const textBottom = (zone: string): number => {
        const walker = document.createTreeWalker(document.querySelector(zone)!, NodeFilter.SHOW_TEXT);
        let bottom = 0;
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          bottom = Math.max(bottom, range.getBoundingClientRect().bottom);
        }
        return bottom;
      };
      return {
        when: textBottom(".notice-when"),
        details: textBottom(".notice-details"),
        lineHeight: parseFloat(getComputedStyle(document.body).lineHeight),
      };
    });
    expect(Number.isFinite(bottoms.lineHeight)).toBe(true);
    expect(Math.abs(bottoms.when - bottoms.details)).toBeLessThanOrEqual(bottoms.lineHeight);
  });

  test("at 375px the parts stack: date, time, place, note, actions", async ({ page }) => {
    await open(page, PREVIEW.homeVirtual);
    await resize(page, 375);
    const tops: number[] = [];
    for (const selector of [
      ".notice-date",
      ".notice-time",
      ".notice-when .notice-meta > p:nth-child(2)",
      ".notice-note",
      ".notice-hero .actions",
    ]) {
      tops.push((await box(page.locator(selector))).y);
    }
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
  });

  test("the cornice projects past the notice and causes no overflow", async ({ page }) => {
    for (const width of [375, 800, 1280]) {
      await open(page, PREVIEW.homeVirtual);
      await resize(page, width);
      const m = await page.locator(".notice-hero").evaluate((el) => {
        const pseudo = getComputedStyle(el, "::before");
        const rect = el.getBoundingClientRect();
        const root = document.documentElement;
        return { cornice: parseFloat(pseudo.width), notice: rect.width, overflow: root.scrollWidth - root.clientWidth };
      });
      expect(m.cornice, `cornice vs notice at ${width}px`).toBeGreaterThan(m.notice);
      expect(m.overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test("exactly one .button; the virtual-link note is shown", async ({ page }) => {
    await open(page, PREVIEW.homeVirtual);
    await expect(page.locator(".button")).toHaveCount(1);
    await expect(page.locator(".notice-note")).toHaveCount(1);
    await expect(page.getByText("Virtual meeting", { exact: true })).toBeVisible();
  });
});

test.describe("home hero (in-person meeting with agenda)", () => {
  test("shows the location and agenda, and no virtual-link note", async ({ page }) => {
    await open(page, PREVIEW.homeInPerson);
    await expect(page.locator(".notice-when")).toContainText("Arlington Central Library, Room 201");
    await expect(page.locator(".notice-note")).toHaveCount(0);
    await expect(page.locator(".notice-hero").getByRole("link", { name: "Agenda" })).toBeVisible();
    await expect(page.getByText("Virtual meeting", { exact: true })).toHaveCount(0);
    await expect(page.locator(".button")).toHaveCount(1);
  });

  test("month and day: one line, 100 to 120px at 1280px", async ({ page }) => {
    await open(page, PREVIEW.homeInPerson);
    await resize(page, 1280);
    const { lines, fontSize } = await readFirstLine(".notice-monthday")(page);
    expect(lines).toBe(1);
    expect(fontSize).toBeGreaterThanOrEqual(100);
    expect(fontSize).toBeLessThanOrEqual(120);
  });
});

test.describe("quick links grid", () => {
  for (const width of [375, 600, 800, 991, 1100, 1280, 1600]) {
    test(`column count is 1, 2, or 4 at ${width}px`, async ({ page }) => {
      await open(page, "/");
      await resize(page, width);
      const columns = await page.locator(".entries-four > li").evaluateAll((items) => {
        const lefts = new Set(items.map((li) => Math.round(li.getBoundingClientRect().left)));
        return lefts.size;
      });
      expect([1, 2, 4]).toContain(columns);
    });
  }
});
