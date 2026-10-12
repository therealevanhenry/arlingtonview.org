/**
 * Fires GitHub repository_dispatch events that rebuild the AVCA website:
 *   onCalendarUpdated  "calendar-updated"  when the meeting calendar changes
 *   onDailyTick        "daily-rebuild"     time-driven, daily (second clock besides GitHub's cron)
 *   onWeeklyLinkCheck  "links-check"       time-driven, weekly
 *   testDispatch       "daily-rebuild"     run by hand to confirm the token works
 * The workflows deploy.yml and links.yml listen for these events.
 *
 * GitHub disables scheduled workflows after 60 days without repository activity, and a disabled
 * workflow ignores every trigger, so each entry point first makes sure its workflow is active.
 *
 * Requires a script property named GITHUB_TOKEN (see README.md).
 * Any unexpected response throws, so Google emails the trigger's owner.
 */
var REPO_API_ = 'https://api.github.com/repos/therealevanhenry/arlingtonview.org';

function request_(method, path, payload) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('Script property GITHUB_TOKEN is not set. See README.md.');
  }
  var options = {
    method: method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  return UrlFetchApp.fetch(REPO_API_ + path, options);
}

function expect_(response, expected, what) {
  var code = response.getResponseCode();
  console.log(what + ' response code: ' + code);
  if (code !== expected) {
    throw new Error(what + ' failed: HTTP ' + code + ' ' + response.getContentText().substring(0, 300));
  }
  return response;
}

function ensureActive_(workflowFile) {
  var path = '/actions/workflows/' + workflowFile;
  var workflow = JSON.parse(expect_(request_('get', path), 200, 'Get ' + workflowFile).getContentText());
  if (workflow.state !== 'active') {
    expect_(request_('put', path + '/enable'), 204, 'Enable ' + workflowFile);
    console.log('Re-enabled ' + workflowFile + '; previous state was ' + workflow.state);
  }
}

function dispatch_(workflowFile, eventType) {
  ensureActive_(workflowFile);
  expect_(request_('post', '/dispatches', { event_type: eventType }), 204, 'Dispatch ' + eventType);
}

function onCalendarUpdated(e) {
  dispatch_('deploy.yml', 'calendar-updated');
}

function onDailyTick() {
  dispatch_('deploy.yml', 'daily-rebuild');
}

function onWeeklyLinkCheck() {
  dispatch_('links.yml', 'links-check');
}

function testDispatch() {
  dispatch_('deploy.yml', 'daily-rebuild');
}
