/** The Meetings page populated: six upcoming meetings across two years and ~24 past rows. */
import { expect, test } from "@playwright/test";
import { box, LONG_LOCATION, LONG_MATERIAL_NAME, open, PREVIEW, resize, textRightEdge } from "./support";

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
    const cells = [...table.querySelectorAll("tbody th, tbody td")];
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
      rows: table.querySelectorAll("tbody tr").length,
      rowHeaders: table.querySelectorAll("tbody tr > th[scope=row]:first-child").length,
      rowDisplay: display(table.querySelector("tbody tr")!),
      tableDisplay: display(table),
    };
  });
  expect(result.tableDisplay).toBe("block");
  expect(result.rowDisplay).toBe("block");
  expect(result.rowHeaders).toBe(result.rows);
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

for (const width of [320, 375, 1280]) {
  test(`long unbroken names wrap inside the page at ${width}px: a material, and a schedule place`, async ({ page }) => {
    await open(page, PREVIEW.meetings);
    await resize(page, width);
    const material = page.locator(".table-archive").getByRole("link", { name: LONG_MATERIAL_NAME });
    await expect(material).toBeVisible();
    const place = page.locator(".schedule-details", { hasText: LONG_LOCATION }).locator(".soft");
    await expect(place).toBeVisible();
    for (const locator of [material, place]) {
      const { right, viewport } = await textRightEdge(locator);
      expect(right).toBeLessThanOrEqual(viewport);
    }
  });
}

test("each row's date is its row header, set like the other cells", async ({ page }) => {
  await open(page, PREVIEW.meetings);
  await resize(page, 1280);
  const rows = await page.locator(".table-archive tbody tr").count();
  await expect(page.locator(".table-archive").getByRole("rowheader")).toHaveCount(rows);
  const weights = await page.locator(".table-archive tbody tr").first().evaluate((tr) => [...tr.children].map((c) => getComputedStyle(c).fontWeight));
  expect(new Set(weights).size).toBe(1);
  expect(weights[0]).toBe("400");
});

test("no two links in the past-meetings table or the schedule share an accessible name", async ({ page }) => {
  await open(page, PREVIEW.meetings);
  const names = await page.locator(".table-archive a, .schedule a").evaluateAll((links) => links.map((a) => (a.textContent ?? "").replace(/\s+/g, " ").trim()));
  expect(names.length).toBeGreaterThan(40);
  expect(names.filter((n) => n === "Agenda" || n === "Minutes")).toEqual([]);
  const repeated = names.filter((n, i) => names.indexOf(n) !== i);
  expect(repeated).toEqual([]);
  // The suffix is for screen readers only: what is drawn is still the one word.
  const agenda = page.locator(".table-archive td[data-label=Agenda] a").first();
  await expect(agenda).toHaveText(/^Agenda, [A-Z][a-z]+ \d{1,2}, \d{4}$/);
  const hidden = await agenda.locator(".visually-hidden").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height, clip: getComputedStyle(el).clipPath };
  });
  expect(hidden.width).toBeLessThanOrEqual(1);
  expect(hidden.height).toBeLessThanOrEqual(1);
  expect(hidden.clip).not.toBe("none");
});
