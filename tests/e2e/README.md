# Browser tests (Playwright)

Real-browser checks on every page, in the states that matter: WebKit (the Safari engine) locally with one
command, WebKit + Chromium + Firefox in CI (`.github/workflows/browsers.yml`).

## Commands

| Command | What it does |
|---|---|
| `npm run test:browsers` | `OFFLINE=1` build, fixture previews, then the WebKit projects (desktop Safari, iPhone 15). The local default. |
| `npm run test:browsers:all` | Same, all four projects (adds Chromium and Firefox desktop). CI runs this. |
| `npm run preview:fixtures` | Only regenerate `dist/_preview/` (needs an existing build). |

The server is `astro preview --ignore-lock` on port 4331, started and stopped by Playwright, so it never
collides with `npm run preview` on 4321. `--ignore-lock` is needed because Astro 7's `preview` refuses to start while
another preview (e.g. your own `npm run preview`) holds its lock; the flag skips only that lock check, and the port
stays exclusive because `reuseExistingServer` is false. A global setup fails fast if the served site is not the
`OFFLINE=1` build with previews present (so a bare `npx playwright test` against a stale or live-data `dist/` cannot
report meaningless results). The HTML report is `playwright-report/`; per-test output
(including a full-page screenshot per page per project, attached to each test) is `test-results/`. Both are
git-ignored.

## What is covered

- `pages.spec.ts`: for the 8 real pages (fallback state) and 4 fixture previews: no horizontal scroll (at the
  project viewport and at 320px), one `h1`, no `script`, no console errors / failed requests / off-origin
  requests, EB Garamond and Source Sans 3 loaded for the weights in use, link and button target size, skip link
  first in tab order and visible, nav focus outline, a full-page screenshot artifact.
- `a11y.spec.ts`: axe-core with WCAG 2.0/2.1 A and AA tags, zero violations, no rule disabled.
- `home-hero.spec.ts`: the hero at 375 and 1280px (type size, one line, zones side by side or stacked, cornice
  projection), the virtual and in-person states, the space above the Agenda link, a long unbroken location
  wrapping inside the notice, and the quick-links column count (1, 2, or 4 at seven widths).
- `meetings.spec.ts`, `documents.spec.ts`: the populated Meetings and Documents previews (row headers, no two
  links with the same accessible name, long unbroken names wrapping), plus the real OFFLINE pages (meeting
  rule, folder links, no conferencing link).

The fixtures carry three strings with no break opportunity on purpose (`LONG_REAL_NAME`, a real 43-character
file name from the owner's Drive; `LONG_MATERIAL_NAME`, 60 characters; `LONG_LOCATION`), so the 320px
no-horizontal-scroll check in `pages.spec.ts` fails if a name or a location can widen the page.
`support.ts` repeats the three values, because the specs do not import the fixture module.

Tap targets: every link and button must be 24x24 CSS px, or have 24px of clear space around it (WCAG 2.5.8
spacing exception only; no inline-link exemption is applied, so the roughly 22px-tall inline links pass because nothing sits within 24px of them). `.button` must be 44px tall.
The hero bottoms check compares the last line of text in each zone, not box edges, because the action links
carry 44px of invisible tap height.

## Fixture previews, and why they cannot be deployed

The live site depends on a calendar and Drive, and with `OFFLINE=1` every page shows its fallback. To see the
populated states, `tests/preview/previews.preview.ts` mocks `loadSiteData` with the invented data in
`tests/preview/fixtures.ts` (fixed dates, fake IDs, no clock) and renders the pages through Astro's container
API into `dist/_preview/`, linking the real built stylesheet.

They stay out of deploys three ways: `npm run build` wipes `dist/`; only `preview:fixtures` writes them; and
`tests/build.test.ts` fails if `dist/_preview` exists.

## Local WebKit prerequisites

Arch: `libxml2-legacy` (extra), `icu74` (AUR), `flite` (extra); the browser build itself comes from
`npx playwright install webkit` (cached in `~/.cache/ms-playwright`). Other Linux distros or macOS:
`npx playwright install --with-deps webkit`.

## Adding a check for a new page

Add `{ name, path }` to `REAL_PAGES` in `support.ts`. Every per-page check and the axe scan then cover it. For a
populated state, add a scenario in `tests/preview/fixtures.ts`, map it to a page in `previews.preview.ts`, and
add it to `PREVIEW_PAGES`/`PREVIEW`. Page-specific checks go in their own spec, using `open()` (waits for fonts)
and `resize()` (waits for layout); never sleep.

## Why no pixel snapshots

Font rasterization differs between this host, CI, and real Safari, so snapshots would be flaky. Layout is
asserted by measurement instead; the screenshots are for a human to look at.
