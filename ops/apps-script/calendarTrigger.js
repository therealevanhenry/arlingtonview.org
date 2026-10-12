/**
 * Fires GitHub repository_dispatch events that rebuild the AVCA website:
 *   onCalendarUpdated  "calendar-updated"  when the meeting calendar changes
 *   onDailyTick        "daily-rebuild"     time-driven, daily (second clock besides GitHub's cron)
 *   onWeeklyLinkCheck  "links-check"       time-driven, weekly
 *   testDispatch       "daily-rebuild"     run by hand to confirm the token works
 * The workflows deploy.yml and links.yml listen for these events.
 *
 * Requires a script property named GITHUB_TOKEN (see README.md).
 * Any response other than 204 throws, so Google emails the trigger's owner.
 */
function dispatch_(eventType) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('Script property GITHUB_TOKEN is not set. See README.md.');
  }

  var response = UrlFetchApp.fetch(
    'https://api.github.com/repos/therealevanhenry/arlingtonview.org/dispatches',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      payload: JSON.stringify({ event_type: eventType }),
      muteHttpExceptions: true
    }
  );

  var code = response.getResponseCode();
  console.log('GitHub dispatch ' + eventType + ' response code: ' + code);
  // GitHub returns 204 on success.
  if (code !== 204) {
    throw new Error(
      'GitHub dispatch ' + eventType + ' failed: HTTP ' + code + ' ' +
      response.getContentText().substring(0, 300)
    );
  }
}

function onCalendarUpdated(e) {
  dispatch_('calendar-updated');
}

function onDailyTick() {
  dispatch_('daily-rebuild');
}

function onWeeklyLinkCheck() {
  dispatch_('links-check');
}

function testDispatch() {
  dispatch_('daily-rebuild');
}
