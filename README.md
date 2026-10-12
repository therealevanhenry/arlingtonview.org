# arlingtonview.org

The website of the Arlington View Civic Association (AVCA), a neighborhood association in Arlington, Virginia.

1. [What this site is](#1-what-this-site-is)
2. [For board members](#2-for-board-members)
3. [How updates reach the site](#3-how-updates-reach-the-site)
4. [When something looks wrong](#4-when-something-looks-wrong)
5. [For developers](#5-for-developers)
6. [Secrets and renewals](#6-secrets-and-renewals)
7. [Cutover record](#7-cutover-record)

## 1. What this site is

This is a static website: pages are built ahead of time and served by GitHub Pages, with no JavaScript running in the visitor's browser. The site rebuilds itself automatically. Its meeting dates come from the AVCA meeting calendar (a public Google Calendar), and its documents come from the association's public Google Drive folders.

Board members keep the calendar and the Drive folders up to date, and the site follows. The only things edited in this repository are the board roster, a few settings, and the resource links, all in plain text files under `src/content/`.

## 2. For board members

You do not need a terminal for any of this. Calendar and Drive changes are made in Google. The three text files are edited in GitHub's web editor (see "Edit a content file" below).

### Change or add a meeting

1. Open the AVCA meeting calendar in Google Calendar.
2. Edit the event (move it, cancel it, or change its time or place), or add a one-off event.
3. Save. The site picks the change up on its next rebuild (see section 3).

What the site does with calendar events:

- Moved, cancelled, and one-off meetings are picked up. A cancelled meeting disappears from the site.
- An all-day event is ignored. A meeting needs a start time.
- An event with no end time is shown as 90 minutes long.
- An in-person meeting needs a location in the event. An event with no location is shown as a virtual meeting, and so is an event whose location contains a web link (the link is dropped and not shown).
- Times are shown in Eastern time.
- Events from two years back to one year ahead are read.

### What the site never shows

The site never shows an event's description or any video-meeting link. The only thing it takes from the description is a link to a Google Doc or Google Drive file, which it uses as the agenda link until an agenda for that date is found in Drive. For that reason, do not paste other Docs or Drive links (recordings, notes) into event descriptions.

> [!CAUTION]
> The calendar itself is public, and the site cannot hide what is in it. Google adds the Meet link to the event description when video conferencing is attached, and attachments such as recordings are listed on the event. Anyone who subscribes to the calendar, or opens its calendar file, can see all of that. If the video link must stay private, do not attach conferencing to events on the public calendar, and send the link to members another way, e.g. by email.

### Publish an agenda or minutes

1. In Google Drive, open the folder "Minutes & Agendas".
2. Open the membership-year folder (for example `2026-2027`), then the month's folder (named `YY MM Month`, for example `26 10 October`). Create the folder if it does not exist yet.
3. Put the file in that folder. A month folder holds that month's agenda and, by convention, the minutes of the previous meeting.
4. Name the file so that it contains:
   - the word "agenda" for an agenda, or the word "minutes" or "mins" for minutes. A file with neither is treated as other meeting material, not as an agenda or minutes.
   - the date of the meeting the file is about, in one of the formats below.
5. Make sure the file can be viewed by anyone with the link. A file that is not shared that way does not appear.

The recommended name from now on is `YYYY-MM-DD <Type> <optional title>`, for example `2026-10-20 Agenda` and `2026-10-20 Minutes`.

The site recognizes these date formats (month first for the numeric forms, and a real calendar date, in the years 1990 to 2100):

| Format | Example file name |
|---|---|
| YYYY-MM-DD (recommended) | `2026-09-30 Minutes.pdf` |
| M.D.YY | `AVCA Meeting Minutes 9.25.24` |
| MM.DD.YYYY | `AVCA Proposed Agenda 06.24.2026` |
| M-D-YYYY | `AVCA Minutes 4-27-2022.docx` |
| M/D/YYYY | `Agenda 3/29/2023.pdf` |
| Month D, YYYY (also `Sept`, `Jun`, and `June 24th, 2026`) | `AVCA Monthly Meeting Proposed Agenda - October 20, 2026` |
| Month YYYY, month only | `Sept 2020 Minutes` |
| YYYY Month, month only | `AVCA 2026 Sep mtg mins` |

Put only one date in a name. If a name has several, the YYYY-MM-DD form wins over the others. Digits run together, such as `06242026`, are not read as a date, and neither is a date that does not exist (such as February 30).

### How minutes are matched

- Minutes appear on the row of the meeting they record. The row is chosen from the date in the file name, wherever the file sits in Drive. For example, June minutes filed in the September folder still appear on the June meeting.
- Minutes with no date in the name are never dated from their folder. They appear on the Documents page only.
- A name with only a month (for example `2026 Sep mtg mins`) is matched to that month's meeting when there is exactly one meeting or dated agenda or minutes file in that month. If the month has none, an agenda or minutes file with a month-only date creates its own row for that month. If the month has two or more, the file is not attached to any row and appears on the Documents page only.
- "(month)" beside a date in the past-meetings table means the date is approximate: the file name gave only a month.
- An agenda or other material with no date in its name takes the month of its folder (the `YY MM Month` folder name) and is matched by the same month rule. Minutes do not.
- If a meeting has two agendas or two sets of minutes, the one that is not a draft is shown, otherwise the most recently changed one. The other moves to the Materials column.
- Other files in the Minutes & Agendas folder, and dated files in the Presentations folder, appear in the Materials column of the meeting they match by the same rules.

### Drafts and retired files

- A name containing `(draft)` is shown and labeled "draft" (for example "Minutes (draft)" in the past-meetings table).
- A name starting with `(OLD)` is hidden everywhere on the site. Use it to retire a file without deleting it. Case and leading spaces do not matter. `(OLD)` in the middle of a name does nothing.

### Presentations, letters, the neighborhood plan, and bylaws

| Material | Drive folder | How it appears |
|---|---|---|
| Presenter materials | Presentations | Documents page, grouped by year from the date in the file name (files with no date are listed last, under "Undated"). A dated file also appears in the Materials column of the matching meeting. |
| Official letters | Official letters, in a year folder (for example `2025 - 2026`) | Documents page, grouped by year folder, newest first. Name each file `YYYY-MM-DD Title.pdf`; the date is shown beside it. |
| Neighborhood Plan | Neighborhood Plan | Documents page, one list. |
| Bylaws | Bylaws, with the subfolders "Proposed Amendments" and "Old Bylaws" | Documents page: the "Current bylaws (PDF)" link first, then the folder's other files, then each subfolder under its own name. When a Google Doc and a PDF in the same folder have the same name, only the PDF is shown. |

Every section on the Documents page ends with "Open folder in Google Drive". The home page's "Recently added" list shows the three most recently changed files in Minutes & Agendas and Presentations.

Folders are read three levels deep below each top folder (for example year, month, and one more). Files deeper than that are not listed.

**When the bylaws change.** The "Current bylaws (PDF)" link points at one file, identified by its file ID in `src/content/settings.yaml` (`drive.bylawsCurrentFileId`). When a new version is adopted:

1. Put the new PDF in the Bylaws folder and make sure anyone with the link can view it.
2. In Drive, right-click the file, choose Share, then Copy link. The link looks like `https://drive.google.com/file/d/1AbC...xyz/view?usp=sharing`.
3. The file ID is the long string between `/d/` and the next `/` (here `1AbC...xyz`).
4. Replace the value of `bylawsCurrentFileId` with that ID (see "Edit a content file").
5. Move the previous PDF into the "Old Bylaws" subfolder.

If `bylawsCurrentFileId` is blank, the "Current bylaws (PDF)" link is left out.

### What must never go in these folders

Everything in these Drive folders is public. Anyone with the link can open it, and the site lists the files by name. Do not put anything with personal information in them: no member contact lists, personal phone numbers or email addresses, or survey results (the survey results are kept out of the shared folders for exactly this reason). The "AVCA History" folder is only linked from the History page, for photos. The same rule applies there.

### Edit a content file

The three content files are plain text. To edit one:

1. Open the repository on GitHub and go to the file, e.g. `src/content/board.yaml`.
2. Click the pencil icon ("Edit this file").
3. Make the change. Keep the spacing and punctuation of the lines around it.
4. Click "Commit changes", choose to commit directly to the `main` branch, and confirm. If GitHub offers only a pull request, ask the person who manages the repository.
5. A rebuild starts by itself. Follow it under the Actions tab (see section 3).

> [!WARNING]
> Known gap, to be fixed by a developer. The automated tests that run before every rebuild currently contain a copy of today's roster, the contact email, and the two county phone numbers. Until those tests are updated, a roster change, a new `term`, a non-blank `joinFormUrl`, a different `contactEmail`, or a change to the phone numbers in `resources.yaml` makes the Deploy run fail at the step "Run npm test". When that happens the live site keeps its old content and nothing is damaged, but the change does not go live until a developer updates the tests (`tests/render.test.ts`, `tests/settings.test.ts`, `tests/layout.test.ts`). Changes to `meetingRule`, `virtualLinkNote`, `bylawsCurrentFileId`, and resource labels or links are not affected.

### Change the board or block captains

Edit `src/content/board.yaml`. Each officer is one line. The format:

```yaml
# Optional. Shown above the roster as "Term: September 2026 to August 2027".
term: { start: "2026-09", end: "2027-08" }
officers:
  - { role: President, name: A. Resident, kind: elected }
  - { role: Treasurer, name: Vacant, kind: elected }
  - { role: Neighborhood liaison, name: B. Neighbor, kind: appointed }
  - { role: President Emeritus, name: C. Example, kind: honorary }
blockCaptains:
  - { block: 1, names: [D. Sample] }
  - { block: 2, names: [E. Person, F. Person] }
  - { block: 3, names: [] }
```

- `kind` is required and must be `elected`, `appointed`, or `honorary`. The About page lists officers under the headings "Elected officers", "Appointed", and "Honorary", in that order, and leaves out a heading with no one under it.
- Write `name: Vacant` (exactly that word) for an office with no one in it. It is shown as "Vacant".
- Write `names: []` for a block with no captain. It is shown as "Vacant", and while any block is vacant the page adds a line inviting residents to contact the president.
- `term` is optional; leave the whole line out to show no term. Months are written `YYYY-MM`, in quotes.
- Only the keys shown are allowed. A misspelled or extra key is an error.

If the file has a mistake (a missing `kind`, a misspelled key, a broken line), the rebuild fails, the live site stays exactly as it was, and the error message names the file and the field, for example `src/content/board.yaml: officers[7].kind: Invalid option ...`. To see the message: open the repository's Actions tab, click the failed run (a red cross) of the workflow "Deploy", click the job "build", and open the failed step (for a content mistake it is "Run npm test"). Fix the file and commit again.

### Change the standing meeting sentence, the contact email, or the membership form link

Edit `src/content/settings.yaml`. The keys you might change:

| Key | What it does |
|---|---|
| `meetingRule` | The standing sentence on the Meetings page (e.g. "Meetings are held on the last Tuesday of the month ..."). The home page shows it in place of a date when no upcoming meeting is found. |
| `virtualLinkNote` | The note about how members get the virtual meeting link. Shown with the contact email on the Meetings page and in the home page's meeting notice when the meeting is virtual. |
| `contactEmail` | The role address shown in the footer and on the home, Meetings, About, and Join pages. Note that the Join page text in `src/content/pages/join.md` also contains the address, and a build check expects the current one, so ask a developer before changing it. |
| `joinFormUrl` | Link to a membership form. A blank value (`""`) means the Join page asks people to email the president. A non-blank value must start with `https://`. |
| `drive.bylawsCurrentFileId` | The file ID of the current bylaws PDF (see above). |

Leave the other keys alone unless a developer asks you to change them: `siteName` (used in page titles), `shortName`, `siteUrl`, `calendarId` (which calendar the site reads), and the other `drive` keys (the Drive folder IDs; `history` is only linked). Only the keys that exist are allowed; a misspelled key fails the build.

### Change the resource links

Edit `src/content/resources.yaml`. It is a list of groups, each with a `title` and a list of `links`. Each link has a `label`, a `url` that starts with `https://`, and an optional `note` (e.g. a phone number, shown as plain text). The weekly link check will open an issue if a link stops working (see section 4).

## 3. How updates reach the site

The site is rebuilt by a GitHub workflow named "Deploy". Each rebuild reads the calendar and the Drive folders as they are at that moment, so the site can be out of date by at most the time until the next rebuild.

| What starts a rebuild | When |
|---|---|
| GitHub's own daily schedule | Every day at 10:00 UTC (6:00 am Eastern in summer, 5:00 am in winter). |
| The Apps Script daily tick | Every day between 7 and 8 am Eastern. A second clock; see below. |
| A calendar change | Within minutes of saving a change to the AVCA meeting calendar, once the Apps Script trigger in `ops/apps-script/` is installed. |
| A change committed to `main` | Right away, e.g. an edit made in the GitHub web editor. |
| Someone starts one by hand | See "Start a rebuild by hand". |

- **Calendar changes** reach the site within minutes (a rebuild takes a few more).
- **Drive changes** (a new agenda, new minutes) appear at the next daily rebuild, or when someone starts one by hand.
- **"Next meeting"** on the home page changes to the following meeting at the first rebuild after a meeting ends, normally the next morning. The same is true of the past-meetings table.

Each run runs the tests, builds the site with live data, checks the finished pages (for example that no video-meeting link and no stray email address leaked into them), and compares the result with the live site. If nothing changed, it skips the deploy (the run still shows green, with the deploy job skipped). If something changed and the build is healthy, it publishes.

### Start a rebuild by hand

1. Open the repository on GitHub and click the Actions tab.
2. In the list on the left, click "Deploy".
3. Click "Run workflow" (a gray button above the list of runs). Leave the branch as `main`.
4. Leave the checkbox "Deploy even if Google Drive or Calendar could not be reached during the build" unticked unless you have been told to tick it (see below).
5. Click the green "Run workflow" button. After a few seconds, refresh; the new run appears at the top. A green check means it finished well; a red cross means it failed.

This needs an account with write access to the repository.

### If Google cannot be reached (the degraded-build rule)

If Google Drive or the calendar cannot be reached during a build, or the Drive key has stopped working (an invalid or restricted key makes Drive answer with an error), the build is called degraded. A degraded build is never published over a working site. The run fails on purpose (red cross), the site stays as it was, and GitHub sends failed-run notifications by email according to each person's notification settings. A run also fails this way when the build is degraded but would have been identical to the live site, so that a broken key cannot go unnoticed.

Two exceptions: the very first deploy (when nothing is published yet) goes ahead with a warning, and a manual run with the "allow degraded" checkbox ticked publishes a degraded build anyway, for example to publish a code fix while Google is down. A missing Drive key (the secret is not set at all) is not treated as an error; the site is then published with "Open folder in Google Drive" links in place of file lists, which replaces any file lists that were live.

### Other rules worth knowing

- Runs do not cancel each other. If a rebuild is already running, a newer one waits for it.
- A run started by hand on any branch other than `main` does nothing: only `main` builds and deploys.
- The second clock exists because GitHub switches off scheduled workflows in a public repository after 60 days without repository activity, and this repository can go months without a change. A switched-off workflow ignores every trigger. The Apps Script tick checks whether the Deploy workflow is on, switches it back on if it is not, and then asks for a rebuild. If that fails, Google emails the owner of the trigger. The Apps Script project also starts the weekly external link check (Thursdays, 7 to 8 am Eastern), next to GitHub's own (Mondays, 12:00 UTC).
- Pushes to other branches and pull requests run the "CI" and "Browsers" workflows (tests and checks only, no deploy).

## 4. When something looks wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| "Next meeting" on the home page shows the standing sentence instead of a date | The calendar could not be read at the last build, or it has no upcoming timed event (all-day events are ignored; a cancelled event is dropped). | Check the calendar has an upcoming timed event. Then start a rebuild by hand. If the run is red, open it and look for a line starting `[calendar] not loaded`. |
| A document section shows only "Open folder in Google Drive" | The folder could not be listed. Either the Drive key is not set, or Google could not be reached or rejected the key. If any folder inside a section fails, the whole section falls back. | Open the latest Deploy run and its "Build" step, and look for lines starting `[drive] folder`. "no API key" means the `GOOGLE_API_KEY` secret is missing (see section 6). "HTTP 400" or "HTTP 403" means the key is wrong, restricted, or the Drive API is switched off for it. |
| A file is missing from the past-meetings table | The name starts with `(OLD)`. Or it is minutes with no recognizable date (those show on the Documents page only). Or it is a month-only name in a month with two or more meetings. Or the name has neither "agenda", "minutes" nor "mins" and no date that matches a meeting. Or the file is not shared with anyone with the link, or sits more than three folders deep. | Rename it with a full date, e.g. `2026-10-20 Minutes`, and check its sharing. Then wait for the next rebuild or start one. |
| A file shows on the wrong meeting | The date in the name is wrong, or the name has several dates and a different one won, or a month-only name was matched to the only meeting that month. | Rename it with the exact date of the meeting it belongs to, in the form `YYYY-MM-DD`. |
| The site did not update after a calendar change | The Apps Script trigger is not installed, was removed, or the GitHub token has expired. Or the rebuild ran but found nothing different. | Open the Actions tab and look for a "Deploy" run started just after your edit. If there is none, see `ops/apps-script/README.md` ("Test it" and "When the token expires"). If the run shows the deploy job skipped, the site was already current. |
| The scheduled rebuild stopped | GitHub switched off the schedule after 60 days of no activity, and the Apps Script tick is not running either (trigger removed or token expired). | In the Actions tab, open "Deploy"; if GitHub shows it as disabled, click "Enable workflow". Then check the Apps Script triggers and the token (section 6). |
| A change to the board, contact email, or phone numbers did not go live | The tests contain a copy of the old values (see the warning in section 2). | Open the failed Deploy run and the step "Run npm test"; ask a developer to update the tests. |
| An issue titled "Broken external links" appeared | The weekly check found a link that no longer works. | Open the issue; it lists the links. Fix or replace them in `src/content/resources.yaml` (or the page text). The check does not close the issue by itself; when a later check is clean it adds a comment, and you can close it. |

Links to `arlingtonva.us` (the county) and `researchgate.net` cannot be checked automatically, because those sites refuse automated visitors. They need an occasional manual look in a real browser; the "Broken external links" issue says so.

### Pausing automatic updates

To pause the site's automatic updates, disabling the Deploy workflow in GitHub is not enough: the Apps Script tick switches it back on. Pause or delete the Apps Script triggers as well (see `ops/apps-script/README.md`), and then disable the workflows in GitHub.

## 5. For developers

### Setup

- Node 24. The version is in `.nvmrc` (`nvm use`). `package.json` requires Node 24 or newer.
- `npm ci` installs exactly what `package-lock.json` says.

### npm scripts

| Script | What it does, and when to use it |
|---|---|
| `npm run dev` | Astro dev server with live reload, port 4321 by default. |
| `npm run build` | Production build into `dist/`. Run it before checking or previewing output. |
| `npm run preview` | Serves the existing `dist/` locally. |
| `npm run astro -- <args>` | The Astro command line, e.g. `npm run astro -- sync`. |
| `npm run check` | `astro check`, the TypeScript and Astro type check. Expect 0 errors, 0 warnings, 0 hints. |
| `npm test` | Unit tests (Vitest). They need no build and use fake responses in place of Google. `tests/build.test.ts` is not part of this run. |
| `npm run test:build` | Builds, then runs the assertions on `dist/` (`tests/build.test.ts`): no script tags, one `h1` per page, no video-meeting link, no stray email address, internal links resolve, and more. CI runs it with `OFFLINE=1`. |
| `npm run test:dist` | The same assertions against an existing `dist/` without building. The Deploy workflow uses it after its real build. |
| `npm run preview:fixtures` | Writes populated sample pages into `dist/_preview/` (needs an existing build). They are never deployed: `npm run build` wipes them, and the build assertions fail if they exist. |
| `npm run test:browsers` | `OFFLINE=1` build, fixture previews, then Playwright with WebKit (desktop Safari and iPhone). The local default for browser checks. |
| `npm run test:browsers:all` | The same with Chromium and Firefox as well. CI runs this. |

`test:browsers` and `test:browsers:all` leave `dist/` as an offline build with `_preview` in it. Run `npm run build` afterwards for a normal build. Two scripts in `scripts/` are not npm scripts: `scripts/check-reproducible.sh` builds twice offline and fails if the output differs (CI runs it), and `scripts/verify-links.sh` reports the HTTP status of external links after a build.

### Environment variables

| Variable | Effect |
|---|---|
| `GOOGLE_API_KEY` | The Drive API key. Without it, every Drive section falls back to a folder link (the build logs "no API key"). The calendar needs no key. |
| `OFFLINE` | When exactly `1`, nothing is fetched from Google and every page shows its fallback, without warnings. Used by tests and CI. |

Nothing else is configurable by environment. `.env` is git-ignored; `.env.example` lists the two variables. `npm run build` reads `.env`. `npm run dev` does not pass `.env` values to the loaders, so set the variable in the shell instead: `GOOGLE_API_KEY=... npm run dev`.

To build against real Drive data: get the key from the owner, put it in `.env` (copy `.env.example`), run `npm run build`, then `npm run preview`. Never commit the key.

### Project layout

| Path | Contents |
|---|---|
| `.github/workflows/` | `deploy.yml` (build and publish), `ci.yml` (tests and checks on branches and pull requests), `browsers.yml` (Playwright in three engines), `links.yml` (weekly external link check). |
| `design/` | The design system notes and the source image for the logo. See `design/README.md`. |
| `docs/superpowers/plans/` | The spec and plan for the site, with the amendments made while building it (Part 3). |
| `ops/apps-script/` | The Google Apps Script that starts rebuilds. See `ops/apps-script/README.md`. |
| `public/` | Files copied as they are: `CNAME`, favicons. |
| `scripts/` | Shell scripts used by the workflows (build health, deploy decision, build hash, link checks, reproducibility). |
| `tests/` | Unit tests (`*.test.ts`), the build assertions, `fixtures/`, `preview/` (sample-page generator), and `e2e/` (Playwright). See `tests/e2e/README.md`. |
| `src/assets/` | The logos and the historic maps used by the History page. |
| `src/components/` | Astro components. |
| `src/content/` | `board.yaml`, `settings.yaml`, `resources.yaml`, their schemas (`schemas.ts`), and the Markdown text of the About, History, and Join pages (`pages/`). |
| `src/layouts/` | The page shell (`Base.astro`). |
| `src/lib/` | The loaders and logic: calendar, Drive, file-name dates, archive grouping, settings, time, paths. |
| `src/pages/` | The routes. |
| `src/styles/` | Design tokens and global CSS. |

The YAML files are read by `src/lib/settings.ts` and checked against strict schemas (a misspelled or extra key fails the build, with the file and field named in the message). They are not content collections.

### Documentation elsewhere

- `design/README.md`: the design system.
- `tests/e2e/README.md`: the browser tests, including the Arch Linux packages needed to run WebKit locally.
- `ops/apps-script/README.md`: installing and testing the calendar trigger and the two clocks.

### Dependencies and base path

Dependencies are exact-pinned. `.npmrc` sets `save-exact=true`, versions in `package.json` have no range, and `package-lock.json` is committed. Keep it that way. Upgrading Playwright should move together with the `ubuntu-24.04` runner pin in `browsers.yml`.

One workflow serves both the github.io preview address and the apex domain. `deploy.yml` asks GitHub Pages (`actions/configure-pages`) for the site's origin and base path and passes them to the build as `--site` and `--base`. The preview lives under a path (`/arlingtonview.org`); on the custom domain the base path is empty, so nothing changes in the workflow at cutover. Internal links go through `withBase()` in `src/lib/paths.ts`. Local builds have no base path, and every internal link ends in a slash. The same Pages values supply the address the "unchanged" check compares against, so before cutover it compares with the github.io site and afterwards with the apex.

## 6. Secrets and renewals

| What | Where it lives | Who can renew it | When it expires |
|---|---|---|---|
| Drive API key (`GOOGLE_API_KEY`) | Repository secret in GitHub (Settings, Secrets and variables, Actions). Created in the Google Cloud project of the AVCA Google Workspace. | Someone who can edit the repository's secrets and someone with access to that Google Cloud project. | Does not expire unless it is rotated. |
| GitHub fine-grained token for the Apps Script trigger | Script property `GITHUB_TOKEN` in the Apps Script project that belongs to the AVCA meeting calendar's owner account. | The GitHub account that created it, plus the Google account that owns the script. | Within one year of creation (the maximum). Renewal date: ____ (YYYY-MM-DD, to be filled in by the owner; keep it equal to the "PAT expires" line in `ops/apps-script/README.md`). |

The Drive API key:

- Is restricted to the Google Drive API.
- Must not have an HTTP-referrer or an IP-address restriction. GitHub's build machines call Drive from the server side, from addresses that change, so either restriction makes every Drive request fail.
- Is only used by the "Build" step of the Deploy workflow, and in local builds through `.env`.

The GitHub token:

- Is a fine-grained token limited to this one repository, with two repository permissions: Contents (read and write) and Actions (read and write). Contents lets the script start a rebuild; Actions lets it check that the workflows are switched on and switch them back on.
- Is replaced as described in "Replacing an expired token" in `ops/apps-script/README.md`. When it expires, Google emails the owner of the trigger and the site stops updating from the calendar and the second clock until it is replaced.

Never put either value in a file in this repository, in an issue, or in a commit message. The built-in token that the workflows themselves use is provided by GitHub and needs no renewal.

## 7. Cutover record

Cutover means moving the arlingtonview.org domain from the old Google Site to this site. This section is a reference and a checklist. It is complete only when the "Date completed" line below is filled in. Until then, the site is not at arlingtonview.org.

### DNS values

Set these at the domain registrar. Leave MX records and the Workspace TXT records exactly as they are. Confirm the values against GitHub's current documentation for Pages custom domains on the day.

| Type | Host | Value |
|---|---|---|
| A | `@` (apex) | `185.199.108.153` |
| A | `@` (apex) | `185.199.109.153` |
| A | `@` (apex) | `185.199.110.153` |
| A | `@` (apex) | `185.199.111.153` |
| AAAA | `@` (apex) | `2606:50c0:8000::153` |
| AAAA | `@` (apex) | `2606:50c0:8001::153` |
| AAAA | `@` (apex) | `2606:50c0:8002::153` |
| AAAA | `@` (apex) | `2606:50c0:8003::153` |
| CNAME | `www` | `therealevanhenry.github.io` |

### Checklist

- [ ] The site has been reviewed at the repository's github.io address: every page, at phone width, and Lighthouse scores of 95 or higher on `/` and `/meetings/`.
- [ ] `public/CNAME` contains `arlingtonview.org` (it is in the repository now, and the build assertions check it).
- [ ] In the repository's Pages settings, the source is GitHub Actions.
- [ ] DNS records above added at the registrar; MX and TXT records untouched.
- [ ] `dig +short arlingtonview.org A` returns the four addresses, `dig +short arlingtonview.org AAAA` the four IPv6 addresses, and `dig +short www.arlingtonview.org CNAME` returns the value above; MX unchanged.
- [ ] Custom domain `arlingtonview.org` set in the Pages settings; certificate issued; "Enforce HTTPS" ticked.
- [ ] `www.arlingtonview.org` redirects to the apex, and `https://arlingtonview.org/build-hash.txt` answers 200.
- [ ] The Deploy workflow was run by hand twice; the second run reported "Unchanged since the last deploy".
- [ ] The Google Site stays published until the new site has served one meeting cycle, then it is unpublished. Date to unpublish: ____
- [ ] Any form or page that mentions the old personal addresses has been updated to the role address.
- [ ] The date below is filled in.

Date completed: ____
