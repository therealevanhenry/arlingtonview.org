import type { FullConfig } from "@playwright/test";

/**
 * Fails fast, with a clear message, if the served site is not what the tests assume: the OFFLINE=1
 * build (every page in its fallback state) plus the fixture previews. Use `npm run test:browsers`.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use.baseURL;
  if (!base) throw new Error("global setup: no baseURL configured");
  const hint = "Run `npm run test:browsers` (OFFLINE=1 build, then preview:fixtures), not a bare `npx playwright test`.";
  const home = await fetch(new URL("/", base));
  if (!home.ok || !(await home.text()).includes('class="notice-rule"')) {
    throw new Error(`The served home page is not the OFFLINE=1 fallback build (no .notice-rule meeting sentence). ${hint}`);
  }
  const preview = await fetch(new URL("/_preview/home-virtual/", base));
  if (!preview.ok) {
    throw new Error(`/_preview/home-virtual/ answered ${preview.status}: fixture previews are missing. ${hint}`);
  }
}
