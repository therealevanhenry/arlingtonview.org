/** The Meetings page populated: six upcoming meetings across two years and ~24 past rows. */
import { expect, test } from "@playwright/test";
import { box, open, PREVIEW, resize } from "./support";

test("upcoming meetings are grouped under year headings in order", async ({ page }) => {
  await open(page, PREVIEW.meetings);
  const years = await page.locator("#upcoming ~ div h3").allTextContents();
  expect(years).toEqual(["2026", "2027"]);
  await expect(page.locator("#upcoming ~ div .schedule-item")).toHaveCount(6);
});

test("past meetings: 24+ rows with a draft, a materials row, and an approximate row", async ({ page }) => {
  await open(page, PREVIEW.meetings);
  expect(await page.locator(".table-archive tbody tr").count()).toBeGreaterThanOrEqual(24);
  await expect(page.locator(".table-archive")).toContainText("(draft)");
  await expect(page.locator(".table-archive")).toContainText("(month)");
  await expect(page.locator(".table-archive td[data-label=Materials] a").first()).toBeVisible();
});

test("at 375px the past-meetings table is stacked, labelled, and hides empty Materials cells", async ({ page }) => {
  await open(page, PREVIEW.meetings);
  await resize(page, 375);
  const result = await page.locator(".table-archive").evaluate((table) => {
    const display = (el: Element, pseudo?: string): string => getComputedStyle(el, pseudo).display;
    const cells = [...table.querySelectorAll("tbody td")];
    const empty = cells.filter((td) => td.classList.contains("cell-empty"));
    const filled = cells.filter((td) => !td.classList.contains("cell-empty"));
    return {
      notBlock: cells.filter((td) => !td.classList.contains("cell-empty") && display(td) !== "block").length,
      labelsHidden: filled.filter((td) => {
        const label = td.getAttribute("data-label") ?? "";
        const before = getComputedStyle(td, "::before");
        return before.display !== "block" || !before.content.includes(label);
      }).length,
      emptyShown: empty.filter((td) => display(td) !== "none").length,
      empties: empty.length,
      rowDisplay: display(table.querySelector("tbody tr")!),
      tableDisplay: display(table),
    };
  });
  expect(result.tableDisplay).toBe("block");
  expect(result.rowDisplay).toBe("block");
  expect(result.notBlock).toBe(0);
  expect(result.labelsHidden).toBe(0);
  expect(result.empties).toBeGreaterThan(0);
  expect(result.emptyShown).toBe(0);
});

test("at 1280px the past-meetings table is a real table no wider than 52rem", async ({ page }) => {
  await open(page, PREVIEW.meetings);
  await resize(page, 1280);
  const table = page.locator(".table-archive");
  expect(await table.evaluate((el) => getComputedStyle(el).display)).toBe("table");
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect((await box(table)).width).toBeLessThanOrEqual(52 * rem + 0.5);
  await expect(page.locator(".table-archive thead")).toBeVisible();
});
