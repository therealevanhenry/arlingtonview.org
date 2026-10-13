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

Board members keep the calendar and the Drive folders up to date, and the site follows. The only things edited in this repository are the board roster, a few settings, the resource links, and the text of the About, History, and Join pages, all in plain text files under `src/content/`.

## 2. For board members

You do not need a terminal for any of this. Calendar and Drive changes are made in Google. The text files under `src/content/` are edited in GitHub's web editor (see "Edit a content file" below).

### Change or add a meeting

1. Open the AVCA meeting calendar in Google Calendar.
2. Edit the event (move it, cancel it, or change its time or place), or add a one-off event.
3. Save. The site picks the change up on its next rebuild (see section 3).

What the site does with calendar events:

- Moved, cancelled, and one-off meetings are picked up. A cancelled meeting disappears from the site.
- An all-day event is ignored. A meeting needs a start time.
- An event with no end time is shown as 90 minutes long.
- The place shown is the event's location, as you wrote it. Web links in the location are removed (a join link must never be published, and the text beside the link is kept), so "Carver Community Center https://maps.example/x" is shown as "Carver Community Center".
- An event with no location, or whose location is only a link, or only one of the words Virtual, Online, Zoom, Google Meet, or Meet (with or without "meeting" after it), is shown as "Virtual meeting".
- The note about how members get the virtual meeting link is added on the home page whenever the meeting counts as virtual: when no location text is left, or the location contains the whole word virtual, zoom, meet, or online. So a hybrid meeting written as "Carver Community Center (also on Zoom)" shows the venue and the note. The same goes for "Meet in the lobby": it is shown as written, with the note beside it. For a meeting that is in person only, write the location without those four words, e.g. "Arlington Hall, 2nd floor".
- Times are shown in Eastern time.
- Events from two years back to one year ahead are read.

### What the site never shows

The site never shows an event's title, its description, or any video-meeting link. It does not read the description at all: nothing typed or pasted there (links, notes, recordings) can reach the site. The "Agenda" link beside a meeting comes from one place only, the agenda file in the Minutes & Agendas folder in Drive (see "Publish an agenda or minutes").

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

An agenda published this way is also what the "Agenda" link beside the meeting points to, on the home page and in the list of upcoming meetings. There is no other way to set that link.

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

### How files are matched to meetings

The calendar decides when meetings were held. A file's name decides which meeting it belongs to.

- A file with a full date in its name goes on the row of the meeting held that day, wherever the file sits in Drive. For example, June minutes filed in the September folder still appear on the June meeting.
- If the full date in the name matches no meeting, but the calendar has exactly one meeting that month, the file goes on that meeting. This is what happens when a meeting is moved: an agenda named for October 27 appears on the meeting that was held on October 20. No extra row is made for October 27.
- An agenda or minutes file with a full date makes a row of its own only when the calendar has no meeting at all in that month (older history, from before the calendar was kept), or has two or more meetings that month and the date matches none of them.
- A name with only a month (for example `2026 Sep mtg mins`) is matched to that month's meeting when the month has exactly one row. If the month has none, an agenda or minutes file with a month-only date creates its own row for that month. If the month has two or more, the file is not attached to any row and appears on the Documents page only.
- "(month)" beside a date in the past-meetings table means the date is approximate: the file name gave only a month. An undated agenda in a month folder, in a month with no meeting, also creates its own "(month)" row.
- An agenda or other material with no date in its name takes the month of its folder (the `YY MM Month` folder name) and is matched by the same month rule.
- Minutes with no date in the name are never dated from their folder, because a month folder holds the previous meeting's minutes. They appear on the Documents page only.
- If a meeting has two agendas or two sets of minutes, the one that is not a draft is shown, otherwise the most recently changed one. The other moves to the Materials column.
- Other files in the Minutes & Agendas folder, and dated files in the Presentations folder, appear in the Materials column of the meeting they match by the same rules.
- If the Minutes & Agendas folder could not be read when the site was built, the Agenda and Minutes columns say "Not available". "Not posted" means the folder was read and there is no such file.

### Drafts and retired files

- Draft minutes are labeled: a minutes file whose name contains `(draft)` appears in the past-meetings table as "Minutes (draft)". A draft agenda is not labeled; it shows as a plain "Agenda" link, and only loses its place to a non-draft agenda for the same meeting (which then takes the Agenda slot, with the draft moving to Materials).
- A name starting with `(OLD)` is hidden everywhere on the site. Use it to retire a file without deleting it. Case and leading spaces do not matter. `(OLD)` in the middle of a name does nothing.
- A file whose name contains an email address (or the text `gmail.com`), or a video-meeting link (Zoom, Google Meet, Teams, Webex), is also hidden everywhere, and the rebuild's log notes it with a line starting `[drive] hidden:`. Rename the file to make it appear.
- A Drive shortcut (a pointer to a file that lives somewhere else) is never listed. Put the file itself, or a copy, in the folder.

### Presentations, letters, the neighborhood plan, and bylaws

| Material | Drive folder | How it appears |
|---|---|---|
| Presenter materials | Presentations | Documents page, grouped by year from the date in the file name (files with no date are listed last, under "Undated"). A dated file also appears in the Materials column of the matching meeting. |
| Official letters | Official letters, in a year folder (for example `2025 - 2026`) | Documents page, grouped by year folder, newest first. Name each file `YYYY-MM-DD Title.pdf`; the date is shown beside it. |
| Neighborhood Plan | Neighborhood Plan | Documents page, one list. |
| Bylaws | Bylaws, with the subfolders "Proposed Amendments" and "Old Bylaws" | Documents page: the "Current bylaws (PDF)" link first, then the folder's other files, then each subfolder under its own name. When a Google Doc and a PDF in the same folder have the same name, only the PDF is shown. |

Every section on the Documents page ends with "Open folder in Google Drive". The home page's "Recently updated" list shows the three most recently changed files in Minutes & Agendas and Presentations (so editing an old file moves it up the list). "Documents updated", in the footer of every page, is the date of the most recently changed file in any of the folders; it says nothing about the page's own text.

Folders are read three levels deep below each top folder (for example year, month, and one more). Files deeper than that are not listed.

**When the bylaws change.** The "Current bylaws (PDF)" link points at one file, identified by its file ID in `src/content/settings.yaml` (`drive.bylawsCurrentFileId`). When a new version is adopted:

1. Put the new PDF in the Bylaws folder and make sure anyone with the link can view it.
2. In Drive, right-click the file, choose Share, then Copy link. The link looks like `https://drive.google.com/file/d/1AbC...xyz/view?usp=sharing`.
3. The file ID is the long string between `/d/` and the next `/` (here `1AbC...xyz`).
4. Replace the value of `bylawsCurrentFileId` with that ID (see "Edit a content file").
5. Move the previous PDF into the "Old Bylaws" subfolder.

If the ID goes stale (the old PDF was moved or deleted and step 4 was forgotten), the link does not break: when the file with that ID is no longer at the top level of the Bylaws folder, the site links the newest PDF at the top level instead (by the date in its name, then by when it was last changed), and the rebuild's log says so in a line starting `[site-data] note:`. Updating the ID is still the tidy thing to do, since it says which file is meant. If `bylawsCurrentFileId` is blank, the "Current bylaws (PDF)" link is left out.

### What must never go in these folders

Everything in these Drive folders is public. Anyone with the link can open it, and the site lists the files by name. Do not put anything with personal information in them: no member contact lists, personal phone numbers or email addresses, or survey results (the survey results are kept out of the shared folders for exactly this reason). The "AVCA History" folder is only linked from the History page, for photos. The same rule applies there. The site hides a file whose name contains an email address or a video-meeting link, but that is a safety net for the file's name only: the file itself is still public in Drive.

Do not remove link sharing from a published folder, or from a folder inside one, to hide something: Drive then reports the folder as having fewer files, or none, and the rebuild fails instead of publishing a thinner list (see "If a build is degraded" in section 3). To retire a file, rename it with `(OLD)` or move it out of the published folders.

### Edit a content file

The content files are plain text. To edit one:

1. Open the repository on GitHub and go to the file, e.g. `src/content/board.yaml`.
2. Click the pencil icon ("Edit this file").
3. Make the change. Keep the spacing and punctuation of the lines around it.
4. Click "Commit changes", choose to commit directly to the `main` branch, and confirm. If GitHub offers only a pull request, ask the person who manages the repository.
5. A rebuild starts by itself. Follow it under the Actions tab (see section 3).

A valid edit to these files goes live with the next deploy (a change committed to `main` starts one). An invalid edit (a misspelled key, a bad value) fails the deploy, leaves the site as it was, and the error message names the file and the field.

### Edit page text

The text of the About, History, and Join pages is in `src/content/pages/about.md`, `history.md`, and `join.md`. Follow "Edit a content file" above with one of those files. Keep the three lines at the top (`---`, `title: ...`, `---`) as they are; below them, paragraphs are separated by a blank line, and a heading is a line starting with `## `. Do not type email addresses into page text: the contact address comes from `contactEmail` in `settings.yaml`, and the deploy fails if any other address, or any gmail.com address, appears on a page. The failing step is "Assert on the built site" (see section 4); the message names the page and the address.

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

If the file has a mistake (a missing `kind`, a misspelled key, a broken line), the rebuild fails, the live site stays exactly as it was, and the error message names the file and the field, for example `src/content/board.yaml: officers[7].kind: Invalid option ...`. To see the message: open the repository's Actions tab, click the failed run (a red cross) of the workflow "Deploy", click the job "build", and open the failed step. For a mistake in a content file's format it is "Run npm test". For something the finished pages must not contain (an email address typed into page text, a video-meeting link) it is "Assert on the built site". Fix the file and commit again.

### Change the standing meeting sentence, the contact email, or the membership form link

Edit `src/content/settings.yaml`. The keys you might change:

| Key | What it does |
|---|---|
| `meetingRule` | The standing sentence on the Meetings page (e.g. "Meetings are held on the last Tuesday of the month ..."). The home page shows it in place of a date when no upcoming meeting is found. |
| `virtualLinkNote` | The note about how members get the virtual meeting link. Shown with the contact email on the Meetings page and in the home page's meeting notice when the meeting is virtual. |
| `contactEmail` | The role address. It is shown in the footer of every page; beside the virtual-link note on the home page (when there is no meeting or the meeting is virtual) and on the Meetings page; on the About page while any block captain position is vacant; and on the Join page. It must be a valid email address, and the only one the site may print. |
| `joinFormUrl` | Link to a membership form. A blank value (`""`) means the Join page asks people to email the president. A non-blank value must start with `https://`. |
| `drive.bylawsCurrentFileId` | The file ID of the current bylaws PDF (see above). |

Leave the other keys alone unless a developer asks you to change them: `siteName` (used in page titles), `shortName`, `siteUrl`, `calendarId` (which calendar the site reads), and the other `drive` keys (the Drive folder IDs; `history` is only linked). `siteUrl` cannot be changed by itself: it has to agree with two other files (see "Dependencies, base path, and the site address" in section 5), and the build fails if it does not. Only the keys that exist are allowed; a misspelled key fails the build.

### Change the resource links

Edit `src/content/resources.yaml`. It is a list of groups, each with a `title` and a list of `links`. Each link has a `label`, a `url` that starts with `https://`, and an optional `note` (e.g. a phone number, shown as plain text). The weekly link check will open an issue if a link stops working (see section 4).

## 3. How updates reach the site

The site is rebuilt by a GitHub workflow named "Deploy". Each rebuild reads the calendar and the Drive folders as they are at that moment, so the site can be out of date by at most the time until the next rebuild.

| What starts a rebuild | When |
|---|---|
| GitHub's own daily schedule | Every day at 10:17 UTC (6:17 am Eastern in summer, 5:17 am in winter). GitHub may start it some minutes late. |
| The Apps Script daily tick | Every day between 7 and 8 am Eastern. A second clock; see below. |
| A calendar change | Within minutes of saving a change to the AVCA meeting calendar, once the Apps Script trigger in `ops/apps-script/` is installed. |
| A change committed to `main` | Right away, e.g. an edit made in the GitHub web editor. |
| Someone starts one by hand | See "Start a rebuild by hand". |

- **Calendar changes** reach the site within minutes (a rebuild takes a few more).
- **Drive changes** (a new agenda, new minutes) appear at the next daily rebuild, or when someone starts one by hand.
- **"Next meeting"** on the home page changes to the following meeting at the first rebuild after a meeting ends, normally the next morning. The same is true of the past-meetings table.

Each run first checks that it is for the newest commit on `main` (if not, it stops there; see "Other rules worth knowing"). Then it runs the tests, builds the site with live data, checks the finished pages (for example that no video-meeting link and no email address other than the contact address leaked into them), decides whether the build is healthy, and compares the result with the live site. If nothing changed, it skips the deploy (the run still shows green, with the deploy job skipped). If something changed and the build is healthy, it publishes.

### Start a rebuild by hand

1. Open the repository on GitHub and click the Actions tab.
2. In the list on the left, click "Deploy".
3. Click "Run workflow" (a gray button above the list of runs). Leave the branch as `main`.
4. Leave the checkbox "Deploy even if the build is degraded ..." unticked unless you have been told to tick it (see below).
5. Click the green "Run workflow" button. After a few seconds, refresh; the new run appears at the top. A green check means it finished well; a red cross means it failed.

This needs an account with write access to the repository.

### If a build is degraded

A build is called degraded when Google was asked for the calendar or the Drive folders and something did not come back right. A degraded build is never published. The run fails on purpose (red cross), the site stays as it was, and GitHub sends failed-run notifications by email according to each person's notification settings. A run also fails this way when the degraded build would have been identical to the live site, so that a broken key cannot go unnoticed.

A build is degraded when any of these is true:

- The calendar could not be read.
- A Drive folder could not be listed: Google could not be reached, or it rejected the key (an invalid or restricted key makes Drive answer with an error).
- A Drive folder came back empty. Every published folder holds files, and Drive answers "no files" without any error when link sharing has been removed from a folder, so an empty folder is treated as that mistake, not as a fact. (If a folder really must be emptied, publish once with the override below.)
- A Drive folder lists far fewer files than the live site shows: it had at least 4 files on the live site, and now has fewer than half as many or is not listed at all. Drive also answers without an error when sharing is removed from a folder inside a published folder; this is how that is caught.

There is one way to publish a degraded build: start the run by hand and tick "Deploy even if the build is degraded" (for example to publish a code fix while Google is down, or after really removing most of a folder's files). There is no other exception, and in particular none for a first deploy.

A missing Drive key (the `GOOGLE_API_KEY` secret is not set at all), or a blank ID in `settings.yaml`, is not a failure by itself: the build is called unconfigured, the run shows a yellow warning that says what is missing, and the site is published with "Open folder in Google Drive" links in place of the file lists. The exception is when the live site already shows file lists (4 or more files in a folder): those folders are then "not listed at all" by the rule above, and the run fails instead of replacing the lists with links. So a secret deleted by accident does not empty the Documents page.

How a run decides (for whoever is reading a failed run):

| What happened | What the run does |
|---|---|
| Healthy build, same as the live site | Green. The deploy job is skipped ("Unchanged since the last deploy"). |
| Healthy build, different from the live site | Green. Deploys. |
| No Drive key (or a blank ID); no folder on the live site lists 4 or more files | Green with a warning ("built without part of its configuration"). Deploys if different. |
| No Drive key (or a blank ID); a folder on the live site lists 4 or more files | Red. That folder is missing from the new build, which would have replaced its list with a link. |
| Drive answered with an error, or timed out | Red. Not deployed. |
| A Drive folder came back empty | Red. Not deployed. |
| A Drive folder lists fewer than half the files the live site shows (when that was 4 or more) | Red. Not deployed. The step "Compare Drive file counts with the live site" names the folder and both counts. |
| The calendar could not be read | Red. Not deployed. |
| The build log has no health line, or more than one | Red. The step "Check build health" fails: a build that does not say it is healthy is not treated as healthy. |
| Any of the red cases above, started by hand with "Deploy even if the build is degraded" ticked | Green with a warning. Deploys if different, skips if identical. |
| The run is for a commit that is no longer the newest on `main` (e.g. an old run re-run by hand) | Green with a notice. Nothing is built or deployed. |
| A check on the finished pages fails ("Assert on the built site") | Red. Not deployed, whatever the checkbox says. |
| The tests or the build itself fail | Red. Not deployed, whatever the checkbox says. |

### Other rules worth knowing

- Runs do not cancel each other. If a rebuild is already running, a newer one waits for it.
- A run started by hand on any branch other than `main` does nothing: only `main` builds and deploys.
- A run only works for the newest commit on `main`. If you re-run an old run from the Actions tab, or two changes are committed in quick succession, the run for the older commit finishes green with a notice ("main is now at ...") and builds nothing; the run for the newest commit does the work. To rebuild, use "Run workflow" (above), not "Re-run jobs" on an old run.
- The second clock exists because GitHub switches off scheduled workflows in a public repository after 60 days without repository activity, and this repository can go months without a change. A switched-off workflow ignores every trigger. The Apps Script tick checks whether the Deploy workflow is on, switches it back on if it is not, and then asks for a rebuild. If that fails, Google emails the owner of the trigger. The Apps Script project also starts the weekly external link check (Thursdays, 7 to 8 am Eastern), next to GitHub's own (Mondays, 12:23 UTC). Runs it starts look like runs started by hand.
- Pushes to other branches and pull requests run the "CI" and "Browsers" workflows (tests and checks only, no deploy).

## 4. When something looks wrong

| Symptom | Likely cause | What to do |
|---|---|---|
| "Next meeting" on the home page shows the standing sentence instead of a date | The calendar has no upcoming timed event (all-day events are ignored; a cancelled event is dropped). Or the build that published the site could not read the calendar and was published anyway (by hand, with the degraded-build checkbox ticked). | Check the calendar has an upcoming timed event. Then start a rebuild by hand. If the run is red, open the "Build" step and look for a line starting `[calendar] not loaded`. |
| A document section shows only "Open folder in Google Drive" | The site was published without the Drive key, or with a blank folder ID (a run with a yellow "built without part of its configuration" warning), or by hand with the degraded-build checkbox ticked. | Open the latest Deploy run. The warning, or the line starting `[site-data] health:` in the "Build" step, says what is missing. "no API key" means the `GOOGLE_API_KEY` secret is missing (see section 6). |
| A Deploy run is red at "Decide whether to deploy" (or at "Check build health") | The build was degraded (see "If a build is degraded" in section 3). The annotations at the top of the run say why. | In the "Build" step, lines starting `[drive] folder` name the folder and the reason: "HTTP 400" or "HTTP 403" means the key is wrong, restricted, or the Drive API is switched off for it; "timeout" or "network error" usually passes by itself (re-run with "Run workflow"); "empty listing" means the folder came back with no files, so check that it is still shared with anyone with the link. `[calendar] not loaded` means the calendar could not be read. The site stays as it was until a healthy run. |
| A folder suddenly lists far fewer files (a red run whose step "Compare Drive file counts with the live site" names a folder and two numbers) | Link sharing was removed from a folder inside a published folder, or many files were moved, deleted, or renamed with `(OLD)` at once. Drive reports no error in either case. | If it was a mistake, restore the sharing ("Anyone with the link") or the files, and start a rebuild. If the files really are meant to go, start a rebuild by hand with "Deploy even if the build is degraded" ticked, once; later runs compare with the new, smaller count. |
| A Deploy run is red at "Assert on the built site" | The finished pages contain something they must never contain. Most often an email address other than the contact address (typed into page text in `src/content/pages/`, or in a calendar event's location), or a video-meeting link. The message names the page and the offending text, and says where addresses should come from. | Remove the address or link from the page text or the calendar event and commit or rebuild. A Drive file with such a name cannot cause this (it is hidden instead). If the message is about anything else (a missing page, a broken internal link), a developer needs to look. |
| A file is missing from the past-meetings table | The name starts with `(OLD)`, or contains an email address or a video-meeting link. Or it is minutes with no recognizable date (those show on the Documents page only). Or it is a month-only name in a month with two or more meetings. Or the name has neither "agenda", "minutes" nor "mins" and no date that matches a meeting. Or it is a Drive shortcut, not a file. Or the file is not shared with anyone with the link, or sits more than three folders deep. | Rename it with a full date, e.g. `2026-10-20 Minutes`, and check its sharing. Then wait for the next rebuild or start one. |
| A file shows on the wrong meeting | The date in the name is wrong, or the name has several dates and a different one won, or the date in the name matched no meeting and the file went to the only meeting that month. | Rename it with the exact date of the meeting it belongs to, in the form `YYYY-MM-DD`. |
| The past-meetings table says "Not available" under Agenda and Minutes | The Minutes & Agendas folder was not read when the site was built (no key, or a build published with the degraded-build checkbox ticked). "Not posted" is what a healthy build says for a file that is not there. | Start a rebuild once Drive is reachable and the key is set. |
| The site did not update after a calendar change | The Apps Script trigger is not installed, was removed, is watching the wrong calendar (it needs the calendar's ID, not an email address), or the GitHub token has expired. Or the rebuild ran but found nothing different. | Open the Actions tab and look for a "Deploy" run started just after your edit. If there is none, see `ops/apps-script/README.md` ("Part 3: Add the trigger", step 6, "Test it", and "When the token expires"). If the run shows the deploy job skipped, the site was already current. |
| The scheduled rebuild stopped | GitHub switched off the schedule after 60 days of no activity, and the Apps Script tick is not running either (trigger removed or token expired). | In the Actions tab, open "Deploy"; if GitHub shows it as disabled, click "Enable workflow". Then check the Apps Script triggers and the token (section 6). |
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
| `npm run test:content-edits` | Guards the board-member workflow: applies valid edits to the content files one at a time (and all together) and requires `npm test` and the build checks to pass, then applies invalid edits and requires a failure that names the file and field. Needs `python3` and a clean working tree (it refuses to run otherwise), restores the content files itself, and leaves `dist/` built from edited content, so run `npm run build` afterwards. CI runs it. |
| `npm run test:build` | Builds, then runs the assertions on `dist/` (`tests/build.test.ts`): no script tags, one `h1` per page, no `target` attribute, no video-meeting link, no email address other than `contactEmail` (and no gmail.com), internal links resolve, `build-meta.json` is well formed, and more. CI runs it with `OFFLINE=1`. The detectors for the link, address, and `target` checks live in `tests/support/dist-checks.ts` and are themselves tested by `npm test` (`tests/dist-checks.test.ts`), so the backstop cannot go quiet unnoticed. |
| `npm run test:dist` | The same assertions against an existing `dist/` without building. The Deploy workflow uses it after its real build. |
| `npm run preview:fixtures` | Writes populated sample pages into `dist/_preview/` (needs an existing build). They are never deployed: `npm run build` wipes them, and the build assertions fail if they exist. |
| `npm run test:browsers` | `OFFLINE=1` build, fixture previews, then Playwright with WebKit (desktop Safari and iPhone). The local default for browser checks. |
| `npm run test:browsers:all` | The same with Chromium and Firefox as well. CI runs this. |

`test:browsers` and `test:browsers:all` leave `dist/` as an offline build with `_preview` in it. Run `npm run build` afterwards for a normal build. Two scripts in `scripts/` are not npm scripts: `scripts/check-reproducible.sh` builds twice offline and fails if the output differs (CI runs it), and `scripts/verify-links.sh` reports the HTTP status of external links after a build.

### Environment variables

| Variable | Effect |
|---|---|
| `GOOGLE_API_KEY` | The Drive API key. Without it, every Drive section falls back to a folder link (the build logs "no API key" per folder and `[site-data] health: unconfigured (no API key)`). The calendar needs no key. |
| `OFFLINE` | When exactly `1`, nothing is fetched from Google and every page shows its fallback, without warnings; the health line is `[site-data] health: ok (offline)`. Used by tests and CI. |

Nothing else is configurable by environment. `.env` is git-ignored; `.env.example` lists the two variables. `npm run build` reads `.env`. `npm run dev` does not pass `.env` values to the loaders, so set the variable in the shell instead: `GOOGLE_API_KEY=... npm run dev`.

To build against real Drive data: get the key from the owner, put it in `.env` (copy `.env.example`), run `npm run build`, then `npm run preview`. Never commit the key.

### Build health and `build-meta.json`

Two things the build produces exist for the deploy workflow, and both are easy to break by accident.

**The health line.** `src/lib/data.ts` prints exactly one line per build, after the calendar and Drive loaders finish:

| Line | Meaning |
|---|---|
| `[site-data] health: ok` | Everything loaded. |
| `[site-data] health: ok (offline)` | `OFFLINE=1`: nothing was fetched, on purpose. |
| `[site-data] health: unconfigured (<what>)` | Nothing failed, but the Drive key or an ID is missing (`no API key`, `no folder ID for <root>`, `calendarId is blank`). |
| `[site-data] health: degraded (<reasons>)` | Google was asked and something did not load, e.g. `drive meetings: HTTP 403; calendar: HTTP 503`. A Drive root fails for any reason other than no key, no ID, or offline; `empty listing` (a tree with no files) is one of them. |

`scripts/build-health.sh` reads that line and nothing else: exit 0 for ok or unconfigured, 1 for degraded, 2 when the line is missing, appears twice, or is malformed (the workflow fails the run). The `[drive] folder ...` and `[calendar] not loaded ...` warnings beside it are for people. Two more kinds of line are notes, not failures: `[drive] hidden: "<name>" (<why>)` for a file left out because of its name, and `[site-data] note: ...` for a stale `bylawsCurrentFileId`. If you add a way for a loader to fail, make it a reason in `buildHealth`; `tests/data.test.ts` feeds the real loaders' output through the script.

**`dist/build-meta.json`** (`src/pages/build-meta.json.ts`) holds `{ "driveFileCounts": { "<root>": <visible files> } }` for the Drive roots that listed, and nothing else (`{}` inside for an offline or keyless build). The workflow fetches the live site's copy and `scripts/drive-drop.sh <live> <new>` exits 1 when a root with 4 or more files on the live site is missing from the new build or has fewer than half as many. The file is part of the build hash, so it must never hold a timestamp or anything else that changes between identical builds.

`scripts/deploy-decision.sh` turns "degraded", "drop", "same as live", and the `allow_degraded` checkbox into deploy or no deploy; its header comment has the table, and section 3 has the same table in words. `scripts/tip-check.sh` is the check that a run is for the newest commit on `main`.

### Project layout

| Path | Contents |
|---|---|
| `.github/workflows/` | `deploy.yml` (build and publish), `ci.yml` (tests and checks on branches and pull requests), `browsers.yml` (Playwright in three engines), `links.yml` (weekly external link check). |
| `design/` | The design system notes and the source image for the logo. See `design/README.md`. |
| `docs/superpowers/plans/` | The spec and plan for the site, with the amendments made while building it (Part 3). |
| `ops/apps-script/` | The Google Apps Script that starts rebuilds. See `ops/apps-script/README.md`. |
| `public/` | Files copied as they are: `CNAME`, favicons. |
| `scripts/` | Shell scripts used by the workflows (build health, Drive file-count drop, tip-of-main check, deploy decision, build hash, link checks, reproducibility) and the content-edit guard. |
| `tests/` | Unit tests (`*.test.ts`), the build assertions and their detectors (`support/`), `fixtures/`, `preview/` (sample-page generator), and `e2e/` (Playwright). See `tests/e2e/README.md`. |
| `src/assets/` | The logos and the aerial photographs used by the History page. |
| `src/components/` | Astro components. |
| `src/content/` | `board.yaml`, `settings.yaml`, `resources.yaml`, their schemas (`schemas.ts`), and the Markdown text of the About, History, and Join pages (`pages/`). |
| `src/layouts/` | The page shell (`Base.astro`). |
| `src/lib/` | The loaders and logic: calendar, Drive, file-name dates, archive grouping, build health (`data.ts`), what must never be printed (`privacy.ts`), settings, time, paths. |
| `src/pages/` | The routes, and `build-meta.json.ts` (see "Build health and `build-meta.json`"). |
| `src/styles/` | Design tokens and global CSS. |

The YAML files are read by `src/lib/settings.ts` and checked against strict schemas (a misspelled or extra key fails the build, with the file and field named in the message). They are not content collections.

### Documentation elsewhere

- `design/README.md`: the design system.
- `tests/e2e/README.md`: the browser tests, including the Arch Linux packages needed to run WebKit locally.
- `ops/apps-script/README.md`: installing and testing the calendar trigger and the two clocks.

### Dependencies, base path, and the site address

Dependencies are exact-pinned. `.npmrc` sets `save-exact=true`, versions in `package.json` have no range, and `package-lock.json` is committed. Keep it that way.

The workflows are pinned too. Every job runs on `ubuntu-24.04`, not `ubuntu-latest`; move that together with a Playwright upgrade (`browsers.yml` installs browsers with `--with-deps`, which depends on the runner's release). GitHub's own actions are used at their current major version. The one third-party action, `lycheeverse/lychee-action` in `links.yml`, is pinned to the full commit of a release, with the version in a comment, and the lychee binary it downloads is pinned through its `lycheeVersion` input; `scripts/lychee-outcome.sh` relies on that lychee version's exit codes, so move the three together. `tests/workflows.test.ts` holds the workflow files to these rules.

One workflow serves both the github.io preview address and the apex domain. `deploy.yml` asks GitHub Pages (`actions/configure-pages`) for the site's origin and base path and passes them to the build as `--site` and `--base`. The preview lives under a path (`/arlingtonview.org`); on the custom domain the base path is empty, so nothing changes in the workflow at cutover. Internal links go through `withBase()` in `src/lib/paths.ts`. Local builds have no base path, and every internal link ends in a slash. The same Pages values supply the address the "unchanged" check compares against, so before cutover it compares with the github.io site and afterwards with the apex.

The site's address is written in three committed files, and they must agree: `site` in `astro.config.mjs`, `siteUrl` in `src/content/settings.yaml`, and `public/CNAME` (the host alone). `tests/site-identity.test.ts` reads all three and fails if they differ, naming the files; to move the site to another domain, change all three in one commit. The agreement matters because `Base.astro` adds `<meta name="robots" content="noindex">` to every page whenever the origin a build was made for is not the origin of `siteUrl`. That is what keeps the github.io preview out of search results (its build gets the github.io origin from the workflow), and it would also hide the real site if `siteUrl` were wrong.

## 6. Secrets and renewals

| What | Where it lives | Who can renew it | When it expires |
|---|---|---|---|
| Drive API key (`GOOGLE_API_KEY`) | Repository secret in GitHub (Settings, Secrets and variables, Actions). Created in the Google Cloud project of the AVCA Google Workspace. | Someone who can edit the repository's secrets and someone with access to that Google Cloud project. | Does not expire unless it is rotated. |
| GitHub fine-grained token for the Apps Script trigger (this repository only; one permission, Actions: read and write) | Script property `GITHUB_TOKEN` in the Apps Script project that belongs to the AVCA meeting calendar's owner account. | The GitHub account that created it, plus the Google account that owns the script. | Within one year of creation (the maximum). Renewal date: ____ (YYYY-MM-DD, to be filled in by the owner; keep it equal to the "PAT expires" line in `ops/apps-script/README.md`). |

The Drive API key:

- Is restricted to the Google Drive API.
- Must not have an HTTP-referrer or an IP-address restriction. GitHub's build machines call Drive from the server side, from addresses that change, so either restriction makes every Drive request fail.
- Is only used by the "Build" step of the Deploy workflow, and in local builds through `.env`.

The GitHub token:

- Is a fine-grained token limited to this one repository, with one repository permission: Actions (read and write). That lets the script check that the workflows are switched on, switch them back on, and start them, which is everything it does. It has no Contents permission, so it cannot change any file in the repository. (A token made from an earlier draft of the instructions, with Contents as well, should be replaced.)
- Is replaced as described in "Replacing an expired token" in `ops/apps-script/README.md`. When it expires, Google emails the owner of the trigger and the site stops updating from the calendar and the second clock until it is replaced.

Never put either value in a file in this repository, in an issue, or in a commit message. The built-in token that the workflows themselves use is provided by GitHub and needs no renewal.

## 7. Cutover record

Cutover means moving the arlingtonview.org domain from the old Google Site to this site. This section is a reference and a checklist. It is complete only when the "Date completed" line below is filled in. Until then, the site is not at arlingtonview.org.

### DNS values

Set these at the domain registrar, at the step of the checklist that says so and not before. Leave MX records and the Workspace TXT records exactly as they are. Confirm the values against GitHub's current documentation for Pages custom domains on the day.

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

Do the steps in this order. The order matters: the domain is claimed on GitHub (verified for the account, then set on this repository) before DNS points at GitHub Pages. If DNS were switched first, the apex would point at GitHub Pages while no site claimed it; during that window it serves a 404, and anyone could attach the domain to a repository of their own.

- [ ] The site has been reviewed at the repository's github.io address: every page, at phone width, and Lighthouse scores of 95 or higher on `/` and `/meetings/`.
- [ ] `public/CNAME` contains `arlingtonview.org` (it is in the repository now, and the build assertions check it).
- [ ] In the repository's Pages settings, the source is GitHub Actions.
- [ ] The domain is verified for the GitHub account that owns the repository: in the account's Settings (not the repository's), Pages, "Add a domain", enter `arlingtonview.org`. GitHub asks for one new TXT record at the registrar; add it beside the existing TXT records and change nothing else, then wait until GitHub shows the domain as verified. The old site keeps working.
- [ ] Custom domain `arlingtonview.org` is set in the repository's Pages settings (repository Settings, Pages, "Custom domain"). GitHub reports that DNS is not set up yet; that is expected at this step. From now on the github.io preview address redirects to `arlingtonview.org`, which still shows the old site until DNS is switched, so the preview can no longer be opened.
- [ ] The Deploy workflow was started by hand and finished healthy (green, with the deploy job run, and no degraded-build warning). The site is now built for the apex, with an empty base path, and waiting on GitHub's side.
- [ ] DNS is switched: the records above added at the registrar; MX and the existing TXT records untouched.
- [ ] `dig +short arlingtonview.org A` returns the four addresses, `dig +short arlingtonview.org AAAA` the four IPv6 addresses, and `dig +short www.arlingtonview.org CNAME` returns the value above; MX unchanged.
- [ ] GitHub has issued the certificate (the Pages settings stop showing a DNS or certificate notice; this can take a while), and then "Enforce HTTPS" is ticked.
- [ ] `www.arlingtonview.org` redirects to the apex, and `https://arlingtonview.org/build-hash.txt` and `https://arlingtonview.org/build-meta.json` answer 200.
- [ ] The Deploy workflow was started by hand twice more; the second run reported "Unchanged since the last deploy".
- [ ] The Google Site stays published until the new site has served one meeting cycle, then it is unpublished. Date to unpublish: ____
- [ ] Any form or page that mentions the old personal addresses has been updated to the role address.
- [ ] The date below is filled in.

Between setting the custom domain and switching DNS, every Deploy run compares its build with `https://arlingtonview.org/build-hash.txt`, which the old site answers with a "not found" page. That only means "different, so deploy" for a healthy build. A degraded build is not published in that window either: there is no first-deploy exception.

Date completed: ____
