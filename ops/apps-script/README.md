# Calendar update trigger

This script tells GitHub to rebuild the AVCA website whenever the Arlington View Civic Association (AVCA) meeting calendar changes, and also once a day and (for the external link check) once a week. It runs in Google Apps Script, under the Google Workspace account that owns the AVCA meeting calendar.

You only need to do this setup once, and again whenever the GitHub token expires. The token is a GitHub personal access token (PAT): a password-like string that lets the script act on one repository on your behalf, without your GitHub password.

Install the script only after `deploy.yml` and `links.yml` are on the repository's `main` branch. Before that, GitHub has no such workflows to start, so every request fails with a 404 and Google emails you each time.

## Token expiry

PAT expires: ____ (YYYY-MM-DD; set a calendar reminder two weeks before)

Fill in the date when you create the token in Part 1. If the token expires, the website stops updating (calendar changes, the daily rebuild, the weekly link check) until you make a new token and replace it (see "Replacing an expired token" below).

## Part 1: Create the GitHub token

1. Sign in to GitHub with an account that can manage the `arlingtonview.org` repository.
2. Go to Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.
3. Click Generate new token.
4. Name it something clear, e.g. "AVCA calendar trigger".
5. Set Expiration to 1 year.
6. Under Repository access, choose Only select repositories, then pick `arlingtonview.org`.
7. Under Permissions, then Repository permissions, set Actions to Read and write. That is the only permission the token needs: with it the script checks that the workflows are switched on, switches them back on, and starts them. Leave everything else at "No access" (GitHub adds Metadata: Read-only by itself). Do not grant Contents: a token with Contents (read and write) could change the repository's files, and this one must not be able to.
8. Click Generate token and copy the token. GitHub shows it only once.
9. Write the expiry date on the "PAT expires" line above and set the calendar reminder.

## Part 2: Create the script

1. Sign in to Google with the Workspace account that owns the AVCA meeting calendar.
2. Go to script.google.com and click New project.
3. Delete the sample code. Paste in the full contents of `calendarTrigger.js` from this folder.
4. Click the Save icon.
5. Click Project Settings (the gear icon), then scroll to Script Properties and click Add script property. Set the name to `GITHUB_TOKEN` and the value to the token you copied. Click Save script properties.

## Replacing an expired token

Create a new token as in Part 1, then open the script's Project Settings, edit the `GITHUB_TOKEN` script property, paste the new token, and click Save script properties. Update the "PAT expires" line and the calendar reminder.

If a token was created from an earlier version of these instructions, it has Contents (read and write) as well. It still works, but it is more powerful than it needs to be: replace it with one that has only Actions (read and write), or edit it on GitHub and set Contents to "No access".

## Part 3: Add the trigger

1. In the left menu, click Triggers (the clock icon).
2. Click Add Trigger.
3. Choose the function to run: `onCalendarUpdated`.
4. Choose event source: From calendar.
5. Choose event type: Calendar updated.
6. For calendar owner email, enter the calendar's ID, not your own email address. The AVCA meeting calendar is a secondary calendar (one created inside an account, not the account's own calendar), and a secondary calendar is identified by its calendar ID: a long string ending in `@group.calendar.google.com`. It is the value of `calendarId` in `src/content/settings.yaml` in the repository. You can also find it in Google Calendar: open the calendar's Settings and sharing, then look under Integrate calendar for "Calendar ID". Copy it exactly.
7. Click Save.
8. Google asks you to authorize the script. Choose the account, click Advanced, then Go to the project, then Allow. This is expected: the script is yours and has not been through Google's public review.

Then add the two time-driven triggers, using Add Trigger again each time:

1. Daily rebuild. First open Project Settings and set the time zone to America/New_York. Function: `onDailyTick`. Event source: Time-driven. Type: Day timer. Time of day: 7am to 8am.
2. Weekly link check. Function: `onWeeklyLinkCheck`. Event source: Time-driven. Type: Week timer. Day: Every Thursday. Time of day: 7am to 8am.

For all three triggers, click Failure notification settings and choose "Notify me immediately", so Google emails you whenever the script fails.

> [!IMPORTANT]
> Step 6 is the part of this setup most likely to be wrong, and nothing warns you when it is. If you enter your account's email address, the trigger watches your own calendar instead of the AVCA meeting calendar: it saves without complaint, and then never fires when a meeting changes. Part 4 is how you find out. Whether Google accepts the calendar ID in this field for this calendar could not be checked when these instructions were written, so treat it as something to confirm during setup.

## Why there are two clocks

The website is rebuilt every morning so "Next meeting" rolls over to the next date. GitHub has its own daily schedule for that (10:17 UTC, so the 7 to 8 am trigger above always runs after it), but its documentation says: "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). This repository is designed to go months without a commit, because the board edits the Calendar and Drive, not the repository, so GitHub may well disable its scheduled workflows.

A disabled workflow ignores every trigger, including this script's. So before each rebuild request, the script checks whether the workflow is active and, if not, switches it back on ("Enables a workflow and sets the state of the workflow to active", https://docs.github.com/en/rest/actions/workflows#enable-a-workflow). If that ever fails, the script stops with an error and Google emails you. If both clocks fire on the same day, nothing is lost: the site is only republished when its content changed.

This also means a workflow that someone disables by hand in GitHub is switched back on by the next tick or the next calendar change. To really pause the site's automatic updates, remove or disable the three Apps Script triggers (Triggers in the left menu), and disable the workflows in GitHub as well. The weekly link check runs on Thursday, GitHub's own on Monday (12:23 UTC), so they do not overlap.

The script starts each workflow the same way the "Run workflow" button in GitHub does ("Create a workflow dispatch event", https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event), so in the Actions tab its runs look like runs started by hand by the account that made the token. That request, the check, and the switch-on all need the same single permission, Actions.

## Part 4: Test it

Do both tests. The first proves the token; the second proves the trigger is watching the right calendar, which the first cannot.

**The token.** Open the script, choose `testDispatch` in the function menu at the top, and click Run. It calls GitHub's enable endpoint for `deploy.yml` every time (a no-op when the workflow is already on), reads the workflow's state, and starts a rebuild. All three need the Actions permission and nothing else, so a successful run proves the token is right. A "Deploy" run should appear in the repository's Actions tab within a minute. If GitHub rejects any of the requests, the run fails and shows the HTTP status.

**The calendar trigger** (confirm during setup):

1. Open the AVCA meeting calendar and edit an event in a way the website shows: e.g. move the next meeting's start time by 15 minutes, then save.
2. Within a few minutes a new "Deploy" run should start in the repository's Actions tab, without you doing anything else.
3. When that run finishes (a green check), open the website and confirm that it shows the change. Then change the event back; a second run should start, and the site should follow.

If no run starts within a few minutes, the trigger is watching the wrong calendar: go back to Part 3, step 6, delete the trigger, and add it again with the calendar ID. (A run that starts but skips its deploy job means the site was already up to date, which is not what this test should produce, since you changed something the site shows.)

If `testDispatch` fails, or to see what a trigger did, open Executions in the left menu of Apps Script and look at the latest entry. A log line ending "response code: 204" for "Start deploy.yml" means GitHub accepted the request. A code of 401 usually means the token is wrong or expired. A code of 403 can mean the token is expired, wrong, or lacks the Actions (read and write) permission. A code of 404 usually means the token cannot access the repository, or the workflow files are not on `main` yet. An error saying GITHUB_TOKEN is not set means Part 2, step 5 was missed. No entry at all after a calendar edit means the trigger did not fire (the wrong calendar, see above).

## When the token expires

Google sends you a failure email from Apps Script ("Summary of failures for Google Apps Script") the next time a trigger runs, and the site stops updating until you replace the token (see "Replacing an expired token"). Run `testDispatch` afterwards to confirm.
