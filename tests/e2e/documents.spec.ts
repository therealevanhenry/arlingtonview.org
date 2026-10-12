/** The Documents page with every section populated (fixture preview), and the real OFFLINE pages. */
import { expect, test } from "@playwright/test";
import { LONG_REAL_NAME, open, PREVIEW, resize, textRightEdge } from "./support";

const SECTIONS = ["bylaws", "minutes", "presentations", "letters", "neighborhood-plan"];

test.describe("populated (fixture preview)", () => {
  test("hidden files and folders never appear", async ({ page }) => {
    await open(page, PREVIEW.documents);
    // Positive control: a sibling of the hidden entries is on the page, so zero matches below means hidden.
    await expect(page.getByRole("link", { name: "AVCA By-Laws (2019)" })).toBeVisible();
    await expect(page.getByText("(OLD)")).toHaveCount(0);
    await expect(page.getByText("Superseded drafts")).toHaveCount(0);
    await expect(page.getByText("Scans to sort")).toHaveCount(0);
  });

  test("each section has exactly one 'Open folder in Google Drive' link", async ({ page }) => {
    await open(page, PREVIEW.documents);
    for (const id of SECTIONS) {
      await expect(page.locator(`#${id}`).getByRole("link", { name: "Open folder in Google Drive" }), id).toHaveCount(1);
    }
    await expect(page.getByRole("link", { name: "Open folder in Google Drive" })).toHaveCount(SECTIONS.length);
  });

  test("each 'Open folder in Google Drive' link names its section for screen readers", async ({ page }) => {
    await open(page, PREVIEW.documents);
    const expected = [
      ["bylaws", "Bylaws"],
      ["minutes", "Minutes and agendas"],
      ["presentations", "Presentations"],
      ["letters", "Official letters"],
      ["neighborhood-plan", "Neighborhood Plan"],
    ] as const;
    for (const [id, section] of expected) {
      // The whole accessible name. The hidden span is absolutely positioned, so name computation may put a space before its comma.
      const name = new RegExp(`^Open folder in Google Drive ?, ${section}$`);
      await expect(page.locator(`#${id}`).getByRole("link", { name }), id).toHaveCount(1);
    }
  });

  test("an undated file shows 'Updated'", async ({ page }) => {
    await open(page, PREVIEW.documents);
    const undated = page.locator("#neighborhood-plan .file", { hasText: "Historic Resources Survey Summary" });
    await expect(undated.locator(".file-date")).toContainText("Updated");
  });

  test("a Google Doc and PDF twin collapses to the PDF in the bylaws list", async ({ page }) => {
    await open(page, PREVIEW.documents);
    const names = await page.locator("#bylaws .file a").allTextContents();
    expect(names.filter((n) => n.startsWith("Proposed Amendment 2026-05-12"))).toEqual(["Proposed Amendment 2026-05-12.pdf"]);
  });

  for (const width of [320, 375]) {
    test(`a long file name with no break opportunity wraps instead of widening the page at ${width}px`, async ({ page }) => {
      await open(page, PREVIEW.documents);
      await resize(page, width);
      const link = page.locator("#bylaws").getByRole("link", { name: LONG_REAL_NAME });
      await expect(link).toBeVisible();
      const { right, viewport } = await textRightEdge(link);
      expect(right).toBeLessThanOrEqual(viewport);
    });
  }
});

test.describe("real OFFLINE build", () => {
  test("every Documents section shows its folder link, each with a different accessible name", async ({ page }) => {
    await open(page, "/documents/");
    for (const id of SECTIONS) {
      await expect(page.locator(`#${id}`).getByRole("link", { name: "Open folder in Google Drive" }), id).toHaveCount(1);
    }
    const names = await page.getByRole("link", { name: "Open folder in Google Drive" }).evaluateAll((links) => links.map((a) => (a.textContent ?? "").trim()));
    expect(new Set(names).size).toBe(SECTIONS.length);
  });

  test("the home hero shows the meeting-rule sentence", async ({ page }) => {
    await open(page, "/");
    const rule = page.locator(".notice-hero .notice-rule");
    await expect(rule).toBeVisible();
    expect((await rule.textContent())?.trim().length ?? 0).toBeGreaterThan(20);
  });

  // The HTML is identical for every project, so this runs once, in webkit-desktop.
  test("no page links to a conferencing service", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "webkit-desktop", "project-independent; runs once");
    for (const path of ["/", "/meetings/", "/documents/", "/about/", "/about/history/", "/join/", "/resources/", "/404.html"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toMatch(/meet\.google\.com|zoom\.us/i);
    }
  });
});
