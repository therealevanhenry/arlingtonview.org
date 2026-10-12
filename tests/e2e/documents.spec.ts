/** The Documents page with every section populated (fixture preview), and the real OFFLINE pages. */
import { expect, test } from "@playwright/test";
import { open, PREVIEW } from "./support";

const SECTIONS = ["bylaws", "minutes", "presentations", "letters", "neighborhood-plan"];

test.describe("populated (fixture preview)", () => {
  test("hidden files and folders never appear", async ({ page }) => {
    await open(page, PREVIEW.documents);
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
});

test.describe("real OFFLINE build", () => {
  test("every Documents section shows its folder link", async ({ page }) => {
    await open(page, "/documents/");
    for (const id of SECTIONS) {
      await expect(page.locator(`#${id}`).getByRole("link", { name: "Open folder in Google Drive" }), id).toHaveCount(1);
    }
  });

  test("the home hero shows the meeting-rule sentence", async ({ page }) => {
    await open(page, "/");
    const rule = page.locator(".notice-hero .notice-rule");
    await expect(rule).toBeVisible();
    expect((await rule.textContent())?.trim().length ?? 0).toBeGreaterThan(20);
  });

  test("no page links to a conferencing service", async ({ request }) => {
    for (const path of ["/", "/meetings/", "/documents/", "/about/", "/about/history/", "/join/", "/resources/", "/404.html"]) {
      const html = await (await request.get(path)).text();
      expect(html, path).not.toMatch(/meet\.google\.com|zoom\.us/i);
    }
  });
});
