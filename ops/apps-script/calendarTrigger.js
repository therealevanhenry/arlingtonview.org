/**
 * Fires a GitHub repository_dispatch event ("calendar-updated") whenever the
 * AVCA meeting calendar changes. The deploy workflow listens for this event
 * and rebuilds the site.
 *
 * Requires a script property named GITHUB_TOKEN (see README.md).
 */
function onCalendarUpdated(e) {
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
      payload: JSON.stringify({ event_type: 'calendar-updated' }),
      muteHttpExceptions: true
    }
  );

  // GitHub returns 204 on success.
  console.log('GitHub dispatch response code: ' + response.getResponseCode());
}
