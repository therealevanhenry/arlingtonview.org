/**
 * Per-page checks, run for every real page (OFFLINE=1 build) and every fixture preview, in every
 * project. One table of pages drives each test body. The 320px overflow check and the tap-target
 * check also run at the project's own viewport.
 */
import { expect, test } from "@playwright/test";
import { ALL_PAGES, hasNoHorizontalScroll, open, resize, settle } from "./support";

for (const { name, path } of ALL_PAGES) {
  test.describe(name, () => {
    test("no horizontal scroll at the project viewport", async ({ page }) => {
      await open(page, path);
      const { scrollWidth, clientWidth } = await hasNoHorizontalScroll(page);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test("no horizontal scroll at 320px", async ({ page }) => {
      await open(page, path);
      await resize(page, 320);
      const { scrollWidth, clientWidth } = await hasNoHorizontalScroll(page);
      expect(clientWidth).toBeLessThanOrEqual(320);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });

    test("one h1, no script elements", async ({ page }) => {
      await open(page, path);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("script")).toHaveCount(0);
    });

    test("no console errors, no failed requests, nothing off-origin", async ({ page, baseURL }) => {
      const probe = await open(page, path);
      expect(probe.consoleErrors).toEqual([]);
      expect(probe.failedRequests).toEqual([]);
      const origin = new URL(baseURL!).origin;
      expect(probe.requests.filter((url) => new URL(url).origin !== origin)).toEqual([]);
    });

    test("EB Garamond and Source Sans 3 are loaded for the weights in use", async ({ page }) => {
      await open(page, path);
      const used = await page.evaluate(() => {
        const wanted = ["EB Garamond", "Source Sans 3"];
        const seen = new Set<string>();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim() || !node.parentElement) continue;
          const style = getComputedStyle(node.parentElement);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const family = style.fontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
          if (wanted.includes(family)) seen.add(`${style.fontWeight} ${family}`);
        }
        return [...seen].sort().map((key) => {
          const [weight = "", ...rest] = key.split(" ");
          const family = rest.join(" ");
          const loaded = [...document.fonts].some((f) => f.family.replace(/^["']|["']$/g, "") === family && f.weight === weight && f.status === "loaded");
          return { family, weight, check: document.fonts.check(`${weight} 16px "${family}"`), loaded };
        });
      });
      expect(used.map((u) => u.family)).toEqual(expect.arrayContaining(["EB Garamond", "Source Sans 3"]));
      for (const u of used) {
        expect(u.check, `document.fonts.check ${u.weight} ${u.family}`).toBe(true);
        expect(u.loaded, `${u.weight} ${u.family} face loaded`).toBe(true);
      }
    });

    test("link and button targets meet WCAG 2.5.8 (24px, or 24px of clear space; no inline exemption); primary actions are 44px tall", async ({ page }) => {
      await open(page, path);
      const { small, short } = await page.evaluate(() => {
        const label = (el: Element): string => `<${el.tagName.toLowerCase()} class="${el.className}"> ${(el.textContent ?? "").trim().slice(0, 40)}`;
        const targets: { el: Element; rect: DOMRect }[] = [];
        for (const el of document.querySelectorAll("a[href], button")) {
          const style = getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") continue;
          // A link that wraps is several boxes; each one is a target.
          for (const rect of el.getClientRects()) if (rect.width > 0 && rect.height > 0) targets.push({ el, rect });
        }
        // Distance from a point to a rectangle (0 when inside).
        const gap = (x: number, y: number, r: DOMRect): number =>
          Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
        const small: string[] = [];
        const short: string[] = [];
        for (const t of targets) {
          const { width, height } = t.rect;
          if (t.el.classList.contains("button") && height < 44) short.push(`${label(t.el)} ${Math.round(height)}px`);
          if (width >= 24 && height >= 24) continue;
          // WCAG 2.5.8 spacing exception (there is no separate inline-link exemption here): a 24px circle centered on the target must touch no other target.
          const cx = t.rect.left + width / 2;
          const cy = t.rect.top + height / 2;
          const crowded = targets.some((u) => u.el !== t.el && gap(cx, cy, u.rect) < 12);
          if (crowded) small.push(`${label(t.el)} ${Math.round(width)}x${Math.round(height)}`);
        }
        return { small, short };
      });
      expect(small).toEqual([]);
      expect(short).toEqual([]);
    });

    for (const width of [undefined, 375]) {
      test(`tab reaches the skip link first, visible, and nav focus has an outline${width ? ` (${width}px wide)` : ""}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name === "webkit-phone", "no keyboard on the touch project; the desktop projects cover tab order");
        await open(page, path);
        if (width) await resize(page, width);
        const skip = page.locator(".skip-link");
        await expect(skip).not.toBeInViewport();
        // Playwright's WebKit tabs through links like Chromium (no Safari "Press Tab to highlight" setting).
        await page.keyboard.press("Tab");
        await expect(skip).toBeFocused();
        await expect(skip).toBeVisible();
        await expect(skip).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Tab"); // the brand link
        await page.keyboard.press("Tab"); // the first nav link
        const nav = page.locator(".site-nav-link").first();
        await expect(nav).toBeFocused();
        const outline = await nav.evaluate((el) => {
          const s = getComputedStyle(el);
          return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
        });
        expect(outline.style).not.toBe("none");
        expect(outline.width).toBeGreaterThanOrEqual(2);
      });
    }

    test("full-page screenshot (artifact, not asserted)", async ({ page }, testInfo) => {
      await open(page, path);
      await settle(page);
      const body = await page.screenshot({ fullPage: true });
      await testInfo.attach(`${name}.png`, { body, contentType: "image/png" });
    });
  });
}
