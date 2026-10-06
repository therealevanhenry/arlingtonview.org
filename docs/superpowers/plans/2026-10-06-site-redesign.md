# arlingtonview.org Redesign: Spec and Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Before Task 7 (layout and design system) the implementer MUST invoke `frontend-design:frontend-design` with the brief in Part 1, section 5.

**Goal:** Replace the Google Sites arlingtonview.org with a fast, understated static site whose meeting dates and documents come from the AVCA Google Workspace calendar and shared drive, so the board never edits the site for the monthly cycle.

**Architecture:** Astro static site in a public GitHub repo, built by GitHub Actions and served from GitHub Pages at the apex domain. At build time, TypeScript loaders fetch the public calendar ICS and list public Drive folders via the Drive API v3, render them in the site's own markup, and degrade to plain folder links when Google is unreachable. Rebuilds run on push, once daily (time rollover and Drive uploads), and on a `repository_dispatch` fired by an Apps Script trigger when the calendar changes. Deploy is skipped when the built output is unchanged.

**Tech Stack:** Astro 5 (latest stable at execution, pinned exactly), TypeScript, Node 24 (`.nvmrc`), npm with committed `package-lock.json` and `npm ci`, Vitest, `node-ical` (ICS parsing with RRULE expansion), `@fontsource/eb-garamond` and `@fontsource/source-sans-3`, `lychee` link checker, GitHub Actions, GitHub Pages, Google Apps Script.

**Spec:** Part 1 of this document. The plan (Part 2) argues from it.

**Repository:** `github.com/therealevanhenry/arlingtonview.org`, local checkout at `~/workspace/arlingtonview.org`. Move this session there with `change_directory` before Task 1. A GitHub org transfer is a later, out-of-scope step.

**Owner inputs still needed (collect at the start of execution, store in `src/content/settings.yaml` unless marked secret):**
1. Public calendar ID for the AVCA meeting calendar (Workspace, marked public; admin external-sharing set to at least "Share all information").
2. Drive folder IDs: Bylaws (contains the current bylaws PDF plus an `Amendments` subfolder), Minutes, Agendas, Presentations, Survey Results. All shared "Anyone with the link: Viewer".
3. File ID of the current bylaws PDF.
4. Membership and mailing-list Google Form URL (re-created under the Workspace account).
5. Current board roster with term dates (the live site says Sept 2024 to Aug 2026, which has expired) and block captains.
6. One-paragraph boundary description and, if available, a boundary map image.
7. The logo JPG (supplied in the planning session) saved to `design/logo-source.jpg`, plus any original vector if one exists.
8. History text, thematic map images, and Neighborhood Day photos exported from the old Google Site into a Drive folder the executor can download from.
9. Google Cloud API key restricted to the Drive API, created under the Workspace (secret: `GOOGLE_API_KEY`).
10. Registrar access for DNS at cutover.

---

# Part 1: Spec

## 1. Context

The current site is a Google Site in the retired `arlingtonviewcivicassociation@gmail.com` account. It is visually dated, carries a hand-typed "next meeting" block that goes stale, points at documents scattered across three Google accounts, and hosts two intake forms (incident reporting, image upload) that nobody monitors. The domain and email now live in a managed Google Workspace, and all public artifacts live in one organized, publicly shared drive under it.

Research across 36 Arlington civic association sites and 13 national ones found that the strongest volunteer-run sites share four traits: the next meeting above the fold, governance documents as Drive links rather than CMS pages, a short curated list of county landing pages, and a mailing list that lives outside the site. Nobody archives presenter materials per meeting, which is an easy differentiator. Link rot to county URLs is the dominant failure mode in Arlington; only top-level county landing pages survive vendor changes.

Decisions made with the owner during planning:
- Hybrid maintenance: code in git, live content in Google. Board members touch only Calendar and Drive.
- Astro on GitHub Pages under `therealevanhenry` for now.
- Meetings from a public Workspace calendar; documents from public Drive folders.
- Rebuild policy: daily cron plus Apps Script calendar trigger plus skip-if-unchanged deploy.
- Keep: board and block captains, join form, resource links, history and Neighborhood Day. Retire: incident and image-upload forms. Route issues to county services.
- Visual direction: civic and understated, single indigo accent from the logo, Garamond-family headings echoing the wordmark.
- The virtual meeting join link is never published on the site.

## 2. Sitemap and navigation

Nav (in order): **Meetings · Documents · About · Join · Resources**. Contact email in the footer. Logo mark plus wordmark at top left links home.

| Route | Content |
|---|---|
| `/` | Next-meeting block (date, time, format, location or "Virtual", agenda link if one exists, "Add to Google Calendar", "Subscribe to calendar"); one paragraph "who we are and who can join" with a Join button; four quick-link cards (Bylaws, Minutes and Agendas, Presentations, County Services); "Recently added" list of the three newest files across Minutes, Agendas, Presentations. |
| `/meetings` | Standing schedule sentence from settings; how to get the virtual link (email list, or email president@); upcoming meetings (next 6 from calendar); past meetings table grouped by meeting date with Agenda, Minutes, Materials columns. |
| `/documents` | Sections: Bylaws (current PDF link, amendments list), Minutes (grouped by year, newest first), Agendas (by year), Presentations and presenter materials (by year), Survey results. Every section ends with "Open folder in Google Drive". |
| `/about` | Mission paragraph; boundaries paragraph and map image or county map link; board table with term dates; block captains list. |
| `/about/history` | History prose, thematic map images, Neighborhood Day photos. |
| `/join` | Eligibility text from the bylaws (homeowners, renters, nonprofits within the boundaries; term September to August); link to the Google Form; note to complete one form per household member. |
| `/resources` | Link groups (section 6). |
| `/404` | Short page with nav. |

## 3. Content model (repo-editable)

`src/content/settings.yaml` (validated by zod in `src/content.config.ts`):
```yaml
siteName: Arlington View Civic Association
shortName: AVCA
siteUrl: https://arlingtonview.org
contactEmail: president@arlingtonview.org
calendarId: ""            # public calendar ID
meetingRule: ""           # e.g. "Fourth Wednesday of the month, 7:00 to 8:30 pm, September through June"
virtualLinkNote: "The virtual meeting link is emailed to members the day before each meeting. Email us if you need it."
joinFormUrl: ""
drive:
  bylaws: ""              # folder ID
  bylawsCurrentFileId: ""
  minutes: ""
  agendas: ""
  presentations: ""
  surveys: ""
```

`src/content/board.yaml`: `term: {start: "2026-09", end: "2028-08"}`, `officers: [{role, name}]`, `blockCaptains: [{block: 1, names: ["..."]}]`.

`src/content/resources.yaml`: `groups: [{title, links: [{label, url, note?}]}]`.

`src/content/pages/about.md`, `history.md`, `join.md`: prose with frontmatter `title`.

Secrets only via environment: `GOOGLE_API_KEY`. Nothing else is configurable by env. No defaults that silently change behavior: a missing `GOOGLE_API_KEY` logs a warning and uses link-only fallback.

## 4. Build-time Google integration

**Calendar.** Fetch `https://calendar.google.com/calendar/ical/<calendarId>/public/basic.ics`. Parse with `node-ical`, expand recurrences for the window [now − 2 years, now + 1 year], drop cancelled instances, honor EXDATE and overridden instances. "Now" is evaluated once per build in `America/New_York`. `nextMeeting` is the first event whose end is after now. If the fetch fails or returns no events: the home block shows the `meetingRule` sentence and the `virtualLinkNote`, with a "Subscribe to calendar" link, never a blank.

Links: Subscribe = `https://calendar.google.com/calendar/u/0?cid=<base64url(calendarId)>` and the ICS URL for non-Google users; Add single event = Google "render?action=TEMPLATE" URL built from the event.

**Drive.** For each folder ID: `GET https://www.googleapis.com/drive/v3/files?q='<id>'+in+parents+and+trashed=false&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true&key=<GOOGLE_API_KEY>`. Follow `nextPageToken`. Timeout 10 s, one retry. On any failure or missing key the loader returns `{ok: false, folderUrl}` and pages render the folder link only, plus a build log warning. Build never fails because of Google.

**Meeting-date parsing from filenames.** Supported, in priority order: `YYYY-MM-DD`, `M.D.YYYY`, `M.D.YY`, `M-D-YYYY`, `M/D/YYYY`, `Mon YYYY` or `Month YYYY` (day = 1, flagged `approximate`). Two-digit years map to 2000+. Unparseable files are `undated` and appear only in the Documents page under their section, newest `modifiedTime` first. The README documents the going-forward convention: `YYYY-MM-DD <Type> <optional title>.pdf`.

**Archive grouping.** Past-meetings rows keyed by date; a row has optional agenda, minutes, and a list of materials. Materials in the same calendar month as a meeting, when their parsed day differs, still attach to that meeting if there is exactly one meeting in that month; otherwise they stay unattached and show on Documents only.

## 5. Design system (brief for frontend-design)

- Tone: a well-run civic institution. Typography-led, generous whitespace, no stock photography, no hero image on the home page. The next-meeting block is the hero.
- Color: accent `--indigo: #3A3796` sampled from the logo (confirm against the traced SVG), text near-black `#1B1B1F`, background warm white `#FBFAF7`, tint `#ECEBF6` for the next-meeting block and callouts, rules `#D9D7CF`. WCAG AA contrast for all text. Dark mode: not required for launch; do not ship a half-done one.
- Type: headings and the wordmark in EB Garamond (self-hosted via fontsource), body in Source Sans 3. System-font fallbacks declared. Max line length about 70 characters.
- Logo: traced SVG of the Gray house line drawing, indigo on transparent, plus a mono variant used for favicon and footer. Wordmark set in EB Garamond small caps, wide tracking, matching the JPG.
- Layout: single column, max width 72rem, 16px gutters at phone width, no horizontal scroll. Header collapses to a plain wrapped nav at narrow widths (no JavaScript menu).
- Client JavaScript: none required. The only permitted script is none at launch.
- Performance target: Lighthouse 95+ on all four categories for `/` and `/meetings` at mobile preset.

## 6. Resource links (initial `resources.yaml`)

Report and get help: Report a Problem `https://www.arlingtonva.us/Government/Topics/Report-Problem`; Police non-emergency 703-558-2222 `https://police.arlingtonva.us/contact/`; Water and sewer emergency 703-228-6555 `https://www.arlingtonva.us/Government/Programs/Water-Utilities/Water/Water-Main-Breaks`; Arlington Alert `https://www.arlingtonva.us/Government/Departments/PSCEM/Emergency-Preparedness/Arlington-Alert`.
Services: Trash and recycling `https://www.arlingtonva.us/Government/Programs/Recycling-and-Trash`; Unwanted medications `https://recycling.arlingtonva.us/household-hazmat/unwanted-medications/`; ART 74 bus `https://www.arlingtontransit.com/pages/routes/art-74/`; Carver Community Center `https://parks.arlingtonva.us/parksfacilities/community-centers/carver-community-center-weekly-schedule/`; Housing help `https://housing.arlingtonva.us/get-help/rental-services/achcv-program/`; Tax relief `https://publicassistance.arlingtonva.us/tax/`; Schools `https://www.apsva.us`.
County government: County Board `https://countyboard.arlingtonva.us`; Public meeting calendar `https://www.arlingtonva.us/Government/Topics/Meeting-Calendar`; A-Z index `https://www.arlingtonva.us/A-Z-Index`; Welcome Kit `https://www.arlingtonva.us/Government/Topics/Welcome-Kit`; Building and permits `https://www.arlingtonva.us/Government/Programs/Building`.
Columbia Pike and civic: Columbia Pike Forward `https://www.arlingtonva.us/Government/Projects/Project-Types/Transportation-Projects/Columbia-Pike-Forward`; Columbia Pike Partnership `https://columbia-pike.org`; Arlington County Civic Federation `https://www.civfed.org`; Comprehensive Plan `https://www.arlingtonva.us/Government/Projects/Plans-Studies/General-Plans/Comprehensive-Plan`.

Executor verifies each URL returns 200 at execution and replaces any that do not with the nearest county landing page.

## 7. Pipeline and operations

- `ci.yml`: on pull request and push to non-main branches: `npm ci`, `npm test`, `npx astro check`, `npm run build`.
- `deploy.yml`: on push to `main`, `schedule: "0 10 * * *"` (06:00 EDT / 05:00 EST), `workflow_dispatch`, `repository_dispatch` types `[calendar-updated]`. Steps: build with `GOOGLE_API_KEY` secret; compute `sha256` over `dist/` contents (sorted paths, excluding `dist/build-hash.txt`); fetch `https://arlingtonview.org/build-hash.txt` (tolerate failure as "different"); if equal, stop; else write the hash file and deploy with `actions/deploy-pages`. No build timestamps in the output; "Last updated" text derives from the newest `modifiedTime` seen.
- `links.yml`: weekly `lychee` over `dist/**/*.html` external links; on failures opens or updates a single issue titled "Broken external links".
- `ops/apps-script/calendarTrigger.js` plus `ops/apps-script/README.md`: installable trigger "From calendar, Calendar updated" on the AVCA calendar; on fire, `POST https://api.github.com/repos/therealevanhenry/arlingtonview.org/dispatches` with `{"event_type":"calendar-updated"}` using a fine-grained PAT (Contents: read and write, this repo only) stored in Script Properties as `GITHUB_TOKEN`. Expiry reminder: PAT max 1 year; README records the renewal date.
- `README.md`: board-member maintenance guide (update a meeting: edit the calendar; publish minutes: upload to the Minutes folder with the date-prefix name; change the board: edit `board.yaml` in the GitHub web editor), plus developer setup and the env var list.

## 8. Cutover

1. Site reviewed at `https://therealevanhenry.github.io/arlingtonview.org/` (build with `base` unset and `site` set to the final URL; preview via Pages on the repo until DNS moves, accepting that absolute links point at the final domain).
2. `public/CNAME` containing `arlingtonview.org`. Pages custom domain set to `arlingtonview.org`.
3. Registrar DNS: four A records at apex `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; four AAAA `2606:50c0:8000::153`, `::8001::153`, `::8002::153`, `::8003::153`; `www` CNAME `therealevanhenry.github.io`. Leave MX and Workspace TXT records untouched.
4. After the certificate issues, enable "Enforce HTTPS". Verify `www` redirects to apex.
5. Keep the Google Site published until the new site has served one meeting cycle, then unpublish it. Update any Google Form confirmation text that mentions the old gmail addresses.

## 9. Out of scope

Visual CMS, groups.io migration, GitHub org transfer, dark mode, analytics, client-side live calendar overlay, the Columbia Pike project page, search.

---

# Part 2: Implementation Plan

## Global Constraints

- Node `24` pinned in `.nvmrc` and in every workflow `setup-node`; dependencies pinned to exact versions (no `^`), `package-lock.json` committed, CI uses `npm ci`.
- No client-side JavaScript shipped at launch. Verify with a test that `dist/` contains no `<script` tags other than Astro's inline `type="application/ld+json"` if used (prefer none).
- Build must succeed with no network and no `GOOGLE_API_KEY` (fallback rendering). Verify in CI by running the build once with `OFFLINE=1`, which makes loaders short-circuit to fallback.
- All external links open in the same tab; no `target="_blank"`.
- No personal phone numbers or personal emails anywhere in content. Role email only.
- Times rendered in `America/New_York`, format `Wednesday, September 23, 2026, 7:00 to 8:30 pm`.
- Copy rules: "civic association" lowercase in prose; the organization name is "Arlington View Civic Association" and the abbreviation "AVCA".
- Commit after every task with a conventional-commit message. Never commit secrets. `.env` is gitignored; `.env.example` lists `GOOGLE_API_KEY=` and `OFFLINE=`.

## Review Focus

1. A recurring meeting series with one instance moved to a different day (RECURRENCE-ID override) and one cancelled (EXDATE): the next-meeting block must show the moved date and skip the cancelled one. Test in Task 3.
2. A build that runs during a meeting (now is between DTSTART and DTEND): the current meeting is still "next". Test in Task 3.
3. Filenames like `AVCA Meeting Minutes.docx` (no date), `AVCA Proposed Agenda 6.23.201.docx` (malformed year), `Sept 2020 Minutes` (month-year): the first two are undated, the third is approximate 2020-09-01, and none crash the build. Test in Task 4.
4. Drive returns HTTP 403 (key restriction misconfigured) or times out: Documents and Meetings pages still render every section with its folder link, and the build exits 0 with a warning. Test in Task 5 and Task 10.
5. The calendar is public but has no future events (summer recess): home shows the standing rule sentence and subscribe link, not an empty block or a past meeting. Test in Task 3 and Task 8.

---

### Task 1: Repository scaffold and CI

**Files:**
- Create: `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `.env.example`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `README.md` (stub), `.github/workflows/ci.yml`, `src/pages/index.astro` (placeholder "Arlington View Civic Association")
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test` (Vitest), `npm run build` (Astro to `dist/`), `npm run check` (`astro check`), `npm run dev`.

- [ ] **Step 1: Initialize the repo and project**

The directory `~/workspace/arlingtonview.org` already exists, pre-seeded with `docs/superpowers/plans/2026-10-06-site-redesign.md` (this plan) and `design/logo-source.jpg`. Keep both.
Run: `cd ~/workspace/arlingtonview.org && git init -b main && npm create astro@latest . -- --template minimal --typescript strict --no-install --no-git` and confirm when create-astro asks to continue in a non-empty directory.
Then pin: edit `package.json` so every dependency version is exact; `echo 24 > .nvmrc`; `npm install`. Add dev deps `vitest`, `@astrojs/check`, `typescript`.

- [ ] **Step 2: Write the smoke test**

```ts
// tests/smoke.test.ts
import { describe, it, expect } from "vitest";
describe("toolchain", () => {
  it("runs", () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 3: Run tests, check, build**

Run: `npm test && npm run check && npm run build`
Expected: all pass; `dist/index.html` exists.

- [ ] **Step 4: Write `ci.yml`**

Triggers: `pull_request`, `push` to branches except `main`. Steps: checkout, `actions/setup-node@v4` with `node-version-file: .nvmrc` and `cache: npm`, `npm ci`, `npm test`, `npm run check`, `OFFLINE=1 npm run build`.

- [ ] **Step 5: Create the GitHub repo and push**

Run: `gh repo create therealevanhenry/arlingtonview.org --public --source . --push`
Expected: repo exists, CI runs green on the first push (note: push to main does not trigger ci.yml; open a trivial branch and PR to confirm, or run `gh workflow run` after Task 11).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Astro project with pinned toolchain and CI"
```

---

### Task 2: Content collections and settings schema

**Files:**
- Create: `src/content.config.ts`, `src/content/settings.yaml`, `src/content/board.yaml`, `src/content/resources.yaml`, `src/content/pages/about.md`, `src/content/pages/history.md`, `src/content/pages/join.md`, `src/lib/settings.ts`
- Test: `tests/settings.test.ts`

**Interfaces:**
- Produces: `getSettings(): Promise<Settings>` in `src/lib/settings.ts` where `Settings` is the zod-inferred type of section 3's YAML; `getBoard(): Promise<Board>`; `getResources(): Promise<ResourceGroup[]>`. Markdown pages via Astro `getEntry("pages", slug)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/settings.test.ts
import { settingsSchema } from "../src/content.config";
it("rejects a settings file missing calendarId", () => {
  expect(() => settingsSchema.parse({ siteName: "x" })).toThrow();
});
it("accepts the committed settings file", async () => {
  const yaml = (await import("yaml")).parse(await fs.readFile("src/content/settings.yaml", "utf8"));
  expect(settingsSchema.parse(yaml).contactEmail).toBe("president@arlingtonview.org");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement schemas and files**

In `src/content.config.ts` export `settingsSchema`, `boardSchema`, `resourcesSchema` (zod) and define collections `settings`, `board`, `resources` (file loaders) and `pages` (glob loader on `src/content/pages`). Fill `settings.yaml` with the owner inputs collected (empty strings allowed only for `calendarId` and folder IDs until supplied; schema marks them `z.string()` and a separate `isConfigured(settings)` helper returns which are blank). Fill `resources.yaml` from spec section 6. Fill `board.yaml` from owner input 5. Write placeholder prose in the three Markdown pages from the current site's text.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/settings.test.ts && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: typed content collections for settings, board, resources, pages"
```

---

### Task 3: Calendar loader

**Files:**
- Create: `src/lib/calendar.ts`, `src/lib/time.ts`, `tests/fixtures/avca.ics`, `tests/fixtures/empty.ics`
- Test: `tests/calendar.test.ts`, `tests/time.test.ts`

**Interfaces:**
- Produces:
  - `type Meeting = { uid: string; start: Date; end: Date; title: string; location?: string; isVirtual: boolean; agendaUrl?: string; description?: string }`
  - `parseIcs(text: string, now: Date): Meeting[]` (sorted ascending, recurrences expanded for [now − 2y, now + 1y], cancelled and EXDATE instances removed, overrides applied)
  - `nextMeeting(meetings: Meeting[], now: Date): Meeting | undefined` (first with `end > now`)
  - `upcoming(meetings: Meeting[], now: Date, n: number): Meeting[]`
  - `past(meetings: Meeting[], now: Date): Meeting[]` (descending)
  - `loadCalendar(settings: Settings, now: Date, fetchImpl = fetch): Promise<{ ok: true; meetings: Meeting[] } | { ok: false; reason: string }>`; returns `ok:false` when `OFFLINE=1`, when `calendarId` is blank, on non-200, or on timeout (10 s).
  - `subscribeLinks(calendarId: string): { google: string; ics: string }` and `addToGoogleCalendarUrl(m: Meeting): string`
  - In `time.ts`: `nowInNewYork(): Date`, `formatMeetingRange(start: Date, end: Date): string` producing `Wednesday, September 23, 2026, 7:00 to 8:30 pm`.
- `isVirtual` is true when location is empty or contains "virtual", "zoom", "meet", or "online" (case-insensitive). `agendaUrl` is the first `https://docs.google.com` or `https://drive.google.com` URL in the description.

- [ ] **Step 1: Write fixtures**

`avca.ics`: a VEVENT series `RRULE:FREQ=MONTHLY;BYDAY=4WE` starting 2025-09-24 19:00 America/New_York to 20:30, with `EXDATE` for 2026-07-22 and 2026-08-26, one override `RECURRENCE-ID:20260923T190000` moved to 2026-09-29 19:00 with `LOCATION:Virtual` and a description containing an agenda Docs URL, and a standalone cancelled event (`STATUS:CANCELLED`) on 2026-10-14. `empty.ics`: a valid calendar with no events.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/calendar.test.ts
const now = new Date("2026-10-06T14:00:00-04:00");
it("skips EXDATE months", () => {
  const m = parseIcs(ics, now).map(x => x.start.toISOString().slice(0,10));
  expect(m).not.toContain("2026-07-22"); expect(m).not.toContain("2026-08-26");
});
it("applies the moved instance", () => {
  const m = parseIcs(ics, now).find(x => x.start.toISOString().startsWith("2026-09-29"));
  expect(m?.isVirtual).toBe(true); expect(m?.agendaUrl).toMatch(/docs.google.com/);
  expect(parseIcs(ics, now).some(x => x.start.toISOString().startsWith("2026-09-23"))).toBe(false);
});
it("drops cancelled events", () => {
  expect(parseIcs(ics, now).some(x => x.start.toISOString().startsWith("2026-10-14"))).toBe(false);
});
it("next meeting is the current one while it is in progress", () => {
  const during = new Date("2026-10-28T23:30:00Z"); // 7:30 pm EDT
  expect(nextMeeting(parseIcs(ics, during), during)?.start.toISOString()).toMatch(/2026-10-28/);
});
it("returns undefined next meeting for an empty calendar", () => {
  expect(nextMeeting(parseIcs(emptyIcs, now), now)).toBeUndefined();
});
it("loadCalendar reports ok:false on 404 without throwing", async () => {
  const r = await loadCalendar(settings, now, async () => new Response("", { status: 404 }));
  expect(r.ok).toBe(false);
});
// tests/time.test.ts
it("formats a range in New York time", () => {
  expect(formatMeetingRange(new Date("2026-09-23T23:00:00Z"), new Date("2026-09-24T00:30:00Z")))
    .toBe("Wednesday, September 23, 2026, 7:00 to 8:30 pm");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/calendar.test.ts tests/time.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `calendar.ts` and `time.ts`**

Add `node-ical` (exact version). Use its `sync.parseICS` and, for recurring events, `event.rrule.between(windowStart, windowEnd, true)` combined with `event.exdate` and `event.recurrences` (overrides keyed by date). Use `Intl.DateTimeFormat` with `timeZone: "America/New_York"` for formatting; drop `:00` minutes never (format fixed as spec).

- [ ] **Step 5: Run tests**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: calendar loader with recurrence, overrides, and offline fallback"
```

---

### Task 4: Filename date parser

**Files:**
- Create: `src/lib/meetingDate.ts`
- Test: `tests/meetingDate.test.ts`

**Interfaces:**
- Produces: `parseMeetingDate(filename: string): { date: string; approximate: boolean } | undefined` where `date` is `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing tests**

```ts
const cases: Array<[string, string | undefined, boolean?]> = [
  ["2026-09-30 Minutes.pdf", "2026-09-30"],
  ["AVCA Meeting Minutes 9.25.24", "2024-09-25"],
  ["AVCA Proposed Agenda 06.24.2026", "2026-06-24"],
  ["AVCA Minutes 4-27-2022.docx", "2022-04-27"],
  ["Agenda 3/29/2023.pdf", "2023-03-29"],
  ["Sept 2020 Minutes", "2020-09-01", true],
  ["AVCA Meeting Minutes.docx", undefined],
  ["AVCA Proposed Agenda 6.23.201.docx", undefined],
  ["Budget 13.40.2024.xlsx", undefined],
];
it.each(cases)("%s", (name, date, approx = false) => {
  const r = parseMeetingDate(name);
  expect(r?.date).toBe(date);
  if (date) expect(r?.approximate).toBe(approx);
});
```

- [ ] **Step 2: Run to verify fail; implement; run to verify pass**

Run: `npx vitest run tests/meetingDate.test.ts`. Implement with ordered regexes from spec section 4; validate month 1-12 and day 1-31 and reject otherwise; two-digit year → 2000+; month names via a 12-entry table accepting 3-letter and full names (and "Sept").

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: tolerant meeting-date parser for Drive filenames"
```

---

### Task 5: Drive loader

**Files:**
- Create: `src/lib/drive.ts`, `tests/fixtures/drive-minutes.json`
- Test: `tests/drive.test.ts`

**Interfaces:**
- Consumes: `parseMeetingDate` (Task 4), `Settings` (Task 2).
- Produces:
  - `type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; url: string; meetingDate?: string; approximate?: boolean; isFolder: boolean }`
  - `type FolderResult = { ok: true; files: DriveFile[]; folderUrl: string } | { ok: false; folderUrl: string; reason: string }`
  - `listFolder(folderId: string, apiKey: string | undefined, fetchImpl = fetch): Promise<FolderResult>`; `folderUrl` is `https://drive.google.com/drive/folders/<id>`; `url` is `webViewLink`; sorts by `meetingDate` desc then `modifiedTime` desc; follows `nextPageToken`; 10 s timeout and one retry; `ok:false` when `OFFLINE=1`, when `apiKey` is undefined, when `folderId` is blank, or on any non-200.
  - `loadAllFolders(settings: Settings, apiKey: string | undefined): Promise<Record<"bylaws"|"minutes"|"agendas"|"presentations"|"surveys", FolderResult>>` running the five in parallel.

- [ ] **Step 1: Write the failing tests**

```ts
it("maps files and parses dates", async () => {
  const r = await listFolder("F1", "k", mockFetch(fixture));
  expect(r.ok && r.files[0].meetingDate).toBe("2026-06-24");
});
it("follows pagination", async () => { /* two-page mock; expect files.length to equal the sum */ });
it("returns ok:false with folderUrl on 403", async () => {
  const r = await listFolder("F1", "k", async () => new Response("{}", { status: 403 }));
  expect(r.ok).toBe(false); expect(r.folderUrl).toBe("https://drive.google.com/drive/folders/F1");
});
it("returns ok:false when apiKey is undefined without calling fetch", async () => {
  const spy = vi.fn(); await listFolder("F1", undefined, spy); expect(spy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify fail; implement; run to verify pass**

Run: `npx vitest run tests/drive.test.ts`. Implement with the URL from spec section 4; `console.warn` once per failed folder with the reason.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Drive folder loader with pagination and link-only fallback"
```

---

### Task 6: Archive grouping and recent-files

**Files:**
- Create: `src/lib/archive.ts`
- Test: `tests/archive.test.ts`

**Interfaces:**
- Consumes: `Meeting` (Task 3), `DriveFile`, `FolderResult` (Task 5).
- Produces:
  - `type ArchiveRow = { date: string; meeting?: Meeting; agenda?: DriveFile; minutes?: DriveFile; materials: DriveFile[] }`
  - `buildArchive(pastMeetings: Meeting[], folders: {agendas: FolderResult; minutes: FolderResult; presentations: FolderResult}): ArchiveRow[]` (descending by date; rows exist for any past meeting or any dated file; same-month attachment rule from spec section 4)
  - `recentFiles(folders: FolderResult[], n: number): DriveFile[]` (by `modifiedTime` desc, non-folders only)
  - `groupByYear(files: DriveFile[]): Array<{ year: string; files: DriveFile[] }>` (undated files under year `"Undated"`, last)

- [ ] **Step 1: Write the failing tests**

```ts
it("attaches a material from the same month to the only meeting that month", () => { /* presentation dated 2026-06-20, meeting 2026-06-24 → row 2026-06-24 has 1 material */ });
it("leaves same-month materials unattached when two meetings share the month", () => { /* expect row materials empty */ });
it("creates a row for a dated minutes file with no calendar event", () => { /* 2021-01-27 minutes, no meeting → row exists with minutes set */ });
it("groups undated files last", () => { expect(groupByYear(files).at(-1)?.year).toBe("Undated"); });
it("recentFiles ignores folders and ok:false results", () => { /* expect length n and no isFolder */ });
```

- [ ] **Step 2: Run to verify fail; implement; run to verify pass**

Run: `npx vitest run tests/archive.test.ts`

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: past-meeting archive grouping and recent-files helpers"
```

---

### Task 7: Layout, design tokens, logo

**Files:**
- Create: `src/layouts/Base.astro`, `src/components/Header.astro`, `src/components/Footer.astro`, `src/styles/tokens.css`, `src/styles/global.css`, `src/assets/logo.svg`, `src/assets/logo-mono.svg`, `public/favicon.svg`, `public/favicon.ico`, `design/logo-source.jpg`, `design/README.md`
- Modify: `src/pages/index.astro` (use layout)
- Test: `tests/build.test.ts` (runs after `npm run build`; see Task 11 for wiring)

**Interfaces:**
- Produces: `Base.astro` props `{ title: string; description?: string }`; CSS custom properties `--indigo`, `--ink`, `--paper`, `--tint`, `--rule`, `--font-display`, `--font-body`, `--measure`.

- [ ] **Step 1: Invoke `frontend-design:frontend-design` with spec section 5 as the brief**

Capture its direction into `design/README.md` (type scale, spacing scale, component inventory). Do not add imagery or client scripts.

- [ ] **Step 2: Trace the logo**

Run: `cargo install vtracer` (or use `potrace` from the Arch repos) then `vtracer --input design/logo-source.jpg --output src/assets/logo-raw.svg --colormode binary --mode polygon`. Crop to the house drawing only (the wordmark is set as live text). Hand-clean in Inkscape or by editing path data: single fill `currentColor`, viewBox tight to the drawing, no raster remnants. Save as `logo.svg`; `logo-mono.svg` is identical with fill `#1B1B1F`. Favicon: the house at 32px, indigo.

- [ ] **Step 3: Write tokens and global styles**

`tokens.css` with the exact colors from spec section 5 and fontsource imports for EB Garamond (400, 500, 600) and Source Sans 3 (400, 600). `global.css`: reset, body on `--paper`, `max-width: 72rem` container, 16px side padding, `.measure { max-width: 70ch }`, focus-visible outlines in indigo, print stylesheet hiding the nav.

- [ ] **Step 4: Build header and footer**

Header: logo mark + wordmark link to `/`; nav list of the five routes; `aria-current="page"` on the active item; wraps at narrow widths without JavaScript. Footer: contact email, "Site source on GitHub" link, "Last updated" placeholder slot filled by pages.

- [ ] **Step 5: Verify**

Run: `npm run build && npx astro preview` and view `/` at mobile preset in the browser; confirm no horizontal scroll at 375px and the wordmark renders in EB Garamond. Run `npm run check`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: base layout, design tokens, traced logo"
```

---

### Task 8: Home page

**Files:**
- Create: `src/components/NextMeeting.astro`, `src/components/MeetingList.astro`, `src/components/QuickLinks.astro`, `src/components/RecentFiles.astro`, `src/lib/data.ts`
- Modify: `src/pages/index.astro`
- Test: `tests/render.test.ts` (uses Astro container API, `experimental_AstroContainer`, to render components with injected data)

**Interfaces:**
- Produces: `loadSiteData(): Promise<SiteData>` in `src/lib/data.ts` where `SiteData = { settings: Settings; now: Date; calendar: Awaited<ReturnType<typeof loadCalendar>>; folders: Awaited<ReturnType<typeof loadAllFolders>> }`; memoized per build so all pages share one fetch set. Components take data as props; none fetch.
- `NextMeeting.astro` props `{ meeting?: Meeting; settings: Settings }`.

- [ ] **Step 1: Write the failing render tests**

```ts
it("NextMeeting renders the standing rule when no meeting", async () => {
  const html = await container.renderToString(NextMeeting, { props: { meeting: undefined, settings } });
  expect(html).toContain(settings.meetingRule); expect(html).toContain("Subscribe");
});
it("NextMeeting shows date, Virtual, agenda link, and add-to-calendar", async () => {
  const html = await container.renderToString(NextMeeting, { props: { meeting: sample, settings } });
  expect(html).toContain("Tuesday, September 29, 2026, 7:00 to 8:30 pm");
  expect(html).toContain("Virtual"); expect(html).toContain("Agenda"); expect(html).toContain("calendar/render?action=TEMPLATE");
  expect(html).not.toContain("zoom.us");
});
```

- [ ] **Step 2: Run to verify fail; implement components and page; run to verify pass**

Home order per spec section 2. `NextMeeting` never prints `description` verbatim (join links may be inside); it prints only parsed fields. `QuickLinks` targets: `/documents#bylaws`, `/meetings#past`, `/documents#presentations`, `/resources`.

- [ ] **Step 3: Verify in browser**

Run: `npm run build && npx astro preview`; with `OFFLINE=1` the block must show the standing rule.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: home page with next-meeting block, quick links, recent files"
```

---

### Task 9: Meetings and Documents pages

**Files:**
- Create: `src/pages/meetings.astro`, `src/pages/documents.astro`, `src/components/ArchiveTable.astro`, `src/components/FileList.astro`, `src/components/FolderFallback.astro`
- Test: extend `tests/render.test.ts`

**Interfaces:**
- Consumes: Task 3, 5, 6, 8 interfaces.
- `FileList.astro` props `{ result: FolderResult; title: string; id: string; byYear?: boolean }`; renders `FolderFallback` (one sentence plus "Open folder in Google Drive") when `result.ok` is false, and always appends the folder link when ok.
- `ArchiveTable.astro` props `{ rows: ArchiveRow[] }`; columns Date, Agenda, Minutes, Materials; approximate dates get a visible "(month)" marker.

- [ ] **Step 1: Write the failing render tests**

```ts
it("FileList renders fallback with folder link on ok:false", async () => {
  const html = await container.renderToString(FileList, { props: { result: { ok: false, folderUrl: "https://drive.google.com/drive/folders/X", reason: "403" }, title: "Minutes", id: "minutes" } });
  expect(html).toContain("Open folder in Google Drive"); expect(html).toContain("folders/X");
});
it("ArchiveTable marks approximate dates", async () => { /* expect "(month)" present for approximate row */ });
```

- [ ] **Step 2: Implement; run tests; build and view both pages with and without `OFFLINE=1`**

Run: `npx vitest run && npm run build`
Expected: PASS; both pages render all sections in both modes.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: meetings archive and documents pages with Drive fallback"
```

---

### Task 10: About, History, Join, Resources, 404

**Files:**
- Create: `src/pages/about/index.astro`, `src/pages/about/history.astro`, `src/pages/join.astro`, `src/pages/resources.astro`, `src/pages/404.astro`, `src/components/BoardTable.astro`, `src/components/LinkGroups.astro`, `public/history/*` (exported images, optimized to WebP ≤ 300 KB each via Astro `<Image>` from `src/assets/history/`)
- Test: extend `tests/render.test.ts` for `BoardTable` (term shown as "September 2026 to August 2028") and `LinkGroups` (every link has `href` starting with `https://`).

- [ ] **Step 1: Write the two failing render tests; run to verify fail**

- [ ] **Step 2: Implement pages**

Join page copy: eligibility sentence from the bylaws as on the current site, "complete one form per household member", the form as a plain link button (no iframe). Resources from `resources.yaml`; include the police and water phone numbers as text next to their links. About: boundary paragraph and image or the county civic-association map link if no image was supplied.

- [ ] **Step 3: Run tests and build; verify each route renders at mobile width**

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: about, history, join, resources, and 404 pages"
```

---

### Task 11: Build verification tests and link checker

**Files:**
- Create: `tests/build.test.ts`, `scripts/verify-links.sh`, `.github/workflows/links.yml`, `lychee.toml`
- Modify: `package.json` scripts: `"test": "vitest run"`, `"test:build": "npm run build && vitest run tests/build.test.ts"`, `"check": "astro check"`.

- [ ] **Step 1: Write `build.test.ts`**

Reads `dist/**/*.html`: asserts no `<script` tags; asserts every page has exactly one `<h1>`; asserts no `target="_blank"`; asserts no string matching `/zoom\.us|meet\.google\.com\/[a-z]{3}-/` (join links); asserts `dist/CNAME` content is `arlingtonview.org`.

- [ ] **Step 2: Run with and without OFFLINE**

Run: `OFFLINE=1 npm run test:build && npm run test:build`
Expected: PASS in both.

- [ ] **Step 3: Add `links.yml`**

Weekly `schedule: "0 12 * * 1"` and `workflow_dispatch`; `npm ci`, `OFFLINE=1 npm run build`, `lycheeverse/lychee-action` over `dist/**/*.html` with `--exclude drive.google.com --exclude docs.google.com --exclude calendar.google.com`; on failure `peter-evans/create-issue-from-file` updating an issue titled "Broken external links". Also run `scripts/verify-links.sh` locally once now and fix any county URL that is not 200.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: build-output assertions and weekly external link check"
```

---

### Task 12: Deploy workflow with skip-if-unchanged

**Files:**
- Create: `.github/workflows/deploy.yml`, `scripts/dist-hash.sh`, `public/CNAME`
- Modify: `astro.config.mjs` (`site: "https://arlingtonview.org"`)

- [ ] **Step 1: Write `scripts/dist-hash.sh`**

Prints `sha256` of the concatenation of `sha256sum` over all files in `dist/` sorted by path, excluding `dist/build-hash.txt`. Test locally: two consecutive `OFFLINE=1` builds produce the same hash.

- [ ] **Step 2: Write `deploy.yml`**

Triggers: `push` to `main`, `schedule: "0 10 * * *"`, `workflow_dispatch`, `repository_dispatch: types: [calendar-updated]`. `concurrency: pages`, cancel-in-progress true. Steps: checkout, setup-node from `.nvmrc`, `npm ci`, `npm test`, `npm run build` with `env: GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}`, compute `NEW=$(scripts/dist-hash.sh)`, `OLD=$(curl -fsSL https://arlingtonview.org/build-hash.txt || echo none)`, if equal then `echo "unchanged, skipping"` and exit 0; else write `dist/build-hash.txt`, `actions/upload-pages-artifact`, `actions/deploy-pages` with `pages: write` and `id-token: write` permissions.

- [ ] **Step 3: Configure the repo**

Run: `gh secret set GOOGLE_API_KEY` (owner pastes the key); in repo settings set Pages source to GitHub Actions. Push to `main` and watch: `gh run watch`.
Expected: deploy succeeds; site visible at the github.io URL (absolute links point at the final domain, acceptable for preview). Trigger a second run with `gh workflow run deploy.yml`; expected: "unchanged, skipping" (the first run after DNS cutover will fetch the real hash; before cutover the curl fails and every run deploys, which is acceptable).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "ci: GitHub Pages deploy with daily schedule, dispatch, and unchanged-skip"
```

---

### Task 13: Apps Script calendar trigger

**Files:**
- Create: `ops/apps-script/calendarTrigger.js`, `ops/apps-script/README.md`

- [ ] **Step 1: Write the script**

`onCalendarUpdated(e)` reads `GITHUB_TOKEN` from `PropertiesService.getScriptProperties()`, posts to `https://api.github.com/repos/therealevanhenry/arlingtonview.org/dispatches` with headers `Authorization: Bearer`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, body `{"event_type":"calendar-updated"}`, and logs the response code. No other logic.

- [ ] **Step 2: Write the README**

Steps for the owner: create a fine-grained PAT (repo `arlingtonview.org`, permission Contents: read and write, 1 year expiry; record the expiry date in the README); in script.google.com under the Workspace account create the project, paste the script, set the property, add trigger "From calendar", "Calendar updated", calendar owner email = the calendar's owner; authorize. Test by editing an event and confirming a `deploy.yml` run appears within a few minutes.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "ops: Apps Script calendar-updated trigger for repository_dispatch"
```

---

### Task 14: README and maintenance guide

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the guide**

Sections: What this site is; For board members (update a meeting, publish minutes/agenda/presentation with the `YYYY-MM-DD <Type> <title>` convention, edit the board roster via the GitHub web editor, what "approximate" means); How updates reach the site (daily build, calendar trigger, how to force a rebuild with "Run workflow"); For developers (Node 24, `npm ci`, `npm run dev`, env vars, `OFFLINE=1`, tests); Secrets and renewal dates (API key, PAT); Cutover record (DNS values from spec section 8, date completed).

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: board maintenance guide and developer setup"
```

---

### Task 15: Cutover

Owner-driven; executor assists and verifies.

- [ ] **Step 1: Pre-flight review** on the github.io URL: every route, mobile width, Lighthouse ≥ 95 on `/` and `/meetings`.
- [ ] **Step 2: DNS** at the registrar per spec section 8. Verify: `dig +short arlingtonview.org A` returns the four GitHub IPs; `dig +short www.arlingtonview.org CNAME` returns `therealevanhenry.github.io.`; MX unchanged.
- [ ] **Step 3: Pages custom domain** `arlingtonview.org`; wait for the certificate; enable Enforce HTTPS. Verify `curl -sI https://www.arlingtonview.org | head -1` is a 301 to the apex and `curl -sI https://arlingtonview.org/build-hash.txt | head -1` is 200.
- [ ] **Step 4: Run `gh workflow run deploy.yml`** and confirm "unchanged, skipping" on an immediate second run.
- [ ] **Step 5: Record** the cutover date in the README; schedule unpublishing the Google Site after one meeting cycle.

---

## Verification (end to end)

1. `npm test && npm run check && OFFLINE=1 npm run test:build && npm run test:build` all pass locally.
2. With real settings: home shows the real next meeting with correct Eastern time; `/meetings` past table shows at least the 2024 to 2026 minutes and agendas grouped by date; `/documents` lists every folder with "Open folder" links.
3. Temporarily set an invalid `GOOGLE_API_KEY` and build: every section shows the folder-link fallback, build exits 0, warnings in the log.
4. Edit a calendar event in the Workspace; a `deploy.yml` run starts within minutes (after Task 13) and the site reflects it.
5. The morning after a meeting, the scheduled run advances "Next meeting" without any human action.
6. Lighthouse mobile ≥ 95 in all four categories on `/` and `/meetings`; no horizontal scroll at 375px; no `<script>` in `dist/`.
7. `links.yml` run is green or has opened the "Broken external links" issue with specifics.

## Self-review notes

- Spec coverage: every route in section 2 maps to Tasks 8 to 10; section 4 to Tasks 3 to 6; section 5 to Task 7; section 7 to Tasks 11 to 13; section 8 to Task 15; section 3 to Task 2.
- Review Focus items 1, 2, 5 are pinned in Task 3 tests (moved instance, cancelled, in-progress, empty) and Task 8 (empty render); item 3 in Task 4; item 4 in Tasks 5, 9, and 11.
- Names used across tasks: `Meeting`, `DriveFile`, `FolderResult`, `ArchiveRow`, `loadCalendar`, `loadAllFolders`, `buildArchive`, `recentFiles`, `groupByYear`, `loadSiteData`, `formatMeetingRange`, `parseMeetingDate`. Consistent.
