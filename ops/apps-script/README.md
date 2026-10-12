# Calendar update trigger

This script tells GitHub to rebuild the AVCA website whenever the Arlington View Civic Association (AVCA) meeting calendar changes, and also once a day and (for the external link check) once a week. It runs in Google Apps Script, under the Google Workspace account that owns the AVCA meeting calendar.

You only need to do this setup once, and again whenever the GitHub token expires. The token is a GitHub personal access token (PAT): a password-like string that lets the script act on one repository on your behalf, without your GitHub password.

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
7. Under Permissions, then Repository permissions, set Contents to Read and write.
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

## Part 3: Add the trigger

1. In the left menu, click Triggers (the clock icon).
2. Click Add Trigger.
3. Choose the function to run: `onCalendarUpdated`.
4. Choose event source: From calendar.
5. Choose event type: Calendar updated.
6. For calendar owner email, enter the email address of the account that owns the AVCA meeting calendar.
7. Click Save.
8. Google asks you to authorize the script. Choose the account, click Advanced, then Go to the project, then Allow. This is expected: the script is yours and has not been through Google's public review.

Then add the two time-driven triggers, using Add Trigger again each time:

1. Daily rebuild. First open Project Settings and set the time zone to America/New_York. Function: `onDailyTick`. Event source: Time-driven. Type: Day timer. Time of day: 5am to 6am.
2. Weekly link check. Function: `onWeeklyLinkCheck`. Event source: Time-driven. Type: Week timer. Day: Every Monday. Time of day: 6am to 7am.

For all three triggers, click Failure notification settings and choose "Notify me immediately", so Google emails you whenever the script fails.

## Why there are two clocks

The website is rebuilt every morning so "Next meeting" rolls over to the next date. GitHub has its own daily schedule for that, but its documentation says: "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows). This repository is designed to go months without a commit, because the board edits the Calendar and Drive, not the repository. The Apps Script daily trigger is a second, independent clock that is not subject to that rule. If both fire, nothing is lost: the site is only republished when its content changed.

## Part 4: Test it

1. Open the AVCA meeting calendar and edit an event, e.g. change the description, then save.
2. Wait a few minutes.
3. In the GitHub repository, open the Actions tab. A new `deploy.yml` run should appear.

To check the token without touching the calendar, open the script, choose `testDispatch` in the function menu at the top, and click Run. A `deploy.yml` run should appear in the Actions tab within a minute. If GitHub rejects the request, the run fails and shows the HTTP status.

If no run appears, in Apps Script open Executions in the left menu and look at the latest entry. A log line ending "response code: 204" means GitHub accepted the request. A code of 401 or 403 usually means the token is wrong or expired. A code of 404 usually means the token cannot access the repository. An error saying GITHUB_TOKEN is not set means Part 2, step 5 was missed.

## When the token expires

Google sends you a failure email from Apps Script ("Summary of failures for Google Apps Script") the next time a trigger runs, and the site stops updating until you replace the token (see "Replacing an expired token"). Run `testDispatch` afterwards to confirm.
