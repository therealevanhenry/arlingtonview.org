# Calendar update trigger

This script tells GitHub to rebuild the AVCA website whenever the Arlington View Civic Association (AVCA) meeting calendar changes. It runs in Google Apps Script, under the Google Workspace account that owns the AVCA meeting calendar.

You only need to do this setup once, and again whenever the GitHub token expires.

## Token expiry

PAT expires: ____ (set a calendar reminder two weeks before)

Fill in the date when you create the token in Part 1. If the token expires, calendar changes stop updating the website until you make a new token and replace it (Part 2, step 5).

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
5. Click Project Settings (the gear icon), then scroll to Script Properties and click Add script property. Set the name to `GITHUB_TOKEN` and the value to the token you copied. Click Save script properties. To replace an expired token later, edit this same property.

## Part 3: Add the trigger

1. In the left menu, click Triggers (the clock icon).
2. Click Add Trigger.
3. Choose the function to run: `onCalendarUpdated`.
4. Choose event source: From calendar.
5. Choose event type: Calendar updated.
6. For calendar owner email, enter the email address of the account that owns the AVCA meeting calendar.
7. Click Save.
8. Google asks you to authorize the script. Choose the account, click Advanced, then Go to the project, then Allow. This is expected: the script is yours and has not been through Google's public review.

## Part 4: Test it

1. Open the AVCA meeting calendar and edit an event, e.g. change the description, then save.
2. Wait a few minutes.
3. In the GitHub repository, open the Actions tab. A new `deploy.yml` run should appear.

If no run appears, in Apps Script open Executions in the left menu and look at the latest entry. A log line "GitHub dispatch response code: 204" means GitHub accepted the request. A code of 401 or 403 usually means the token is wrong or expired. A code of 404 usually means the token cannot access the repository. An error saying GITHUB_TOKEN is not set means Part 2, step 5 was missed.
